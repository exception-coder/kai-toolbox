import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { query, forkSession } from '@anthropic-ai/claude-agent-sdk'
import { Permissions, type Decision } from './permissions.js'
import { createWelfareDbServer } from './welfareDb.js'
import { createErpDbServer } from './erpDb.js'
import { createErpAppServer } from './erpApp.js'
import { createSrmDbServer } from './srmDb.js'
import { createSrmAppServer } from './srmApp.js'
import { createScmDbServer } from './scmDb.js'
import { createForgePendingSqlServer, FORGE_PENDING_SQL_STEER } from './forgePendingSql.js'
import {
  CROSS_TOPOLOGY_READONLY_TOOLS,
  DOMAIN_KNOWLEDGE_READONLY_TOOLS,
  createCrossTopologyServer,
  createDomainKnowledgeServer,
  knowledgeMcpRecoveryPrompt,
  readonlyKnowledgeMcpCall,
  retryReadonlyKnowledgeMcp,
  type ReadonlyKnowledgeMcpCall,
} from './knowledgeMcp.js'
import { codexMcpCapabilities, normalizeCodexHome, runCodexTurn, runEphemeralCodexTurn, type CodexReasoningEffort, type CodexSpeed } from './codexEngine.js'
import { createClaudeConsultSourceServer, resolveConsultTargetSystems } from './codexSecurity.js'
import { findDefaultCodexModel, forkCodexThread, listCodexModels, type CodexModelInfo } from './codexAppServer.js'
import { runAntigravityTurn } from './antigravityEngine.js'
import { listAntigravityModels } from './antigravityRuntime.js'
import { answerOpencodePermission, emitOpencodeModels, runOpencodeTurn, updateOpencodePermissionPolicy } from './opencodeEngine.js'
import { activityOutputTail, elapsedSince, emitToolActivity, summarizeToolInput } from './toolActivity.js'
import { classifyCommandResult } from './commandExecution.js'
import { appendWindowsExecutionInstructions, windowsExecutionInstructions } from './windowsExecution.js'
import { TurnLifecycle, type InterruptSnapshot } from './turnLifecycle.js'
import {
  McpToolWatchdog,
  McpToolTimeoutAbort,
  configuredMcpToolHeartbeatMs,
  configuredMcpToolMaxDurationMs,
  configuredMcpToolTimeoutMs,
  type McpToolWatchdogEntry,
} from './mcpToolWatchdog.js'
import {
  ToolExecutionTimeoutAbort,
  ToolExecutionWatchdog,
  configuredToolExecutionHeartbeatMs,
  configuredToolExecutionIdleTimeoutMs,
  configuredToolExecutionMaxDurationMs,
  type ToolExecutionWatchdogEntry,
} from './toolExecutionWatchdog.js'
import { createBuiltinEngineRegistry } from './engine/builtinEngineAdapters.js'
import { isEngineId, publicAgentEvent, type EngineId, type EngineImageInput } from './engine/engineContract.js'
import type { EngineAdapterRegistry } from './engine/engineRegistry.js'
import { DeepSeekHarnessAdapter, deepSeekHarnessConfigFromEnv } from './engine/deepSeekHarnessAdapter.js'
import type { EngineCatalog } from './engine/engineCatalog.js'

export type Engine = EngineId

type Emit = (sessionId: string, event: Record<string, unknown>) => void

export interface InterruptAck {
  outcome: InterruptSnapshot['outcome'] | 'sessionNotFound'
  active: boolean
  pendingDecision: boolean
  activeTurnId?: string
}

export interface SessionRuntimeSnapshot {
  sessionPresent: boolean
  engine?: Engine
  active: boolean
  pendingDecision: boolean
  backgroundTaskCount: number
  activeTurnId?: string
  phase?: string
  agentState: 'idle' | 'running' | 'waiting' | 'finalizing' | 'failed' | 'unknown'
  lastHeartbeatAt: number
}

type CapabilitySnapshot = {
  slashCommands: string[]
  skills: string[]
  agents: string[]
  mcpServers: Array<{ name: string; status: string }>
  outputStyle: string | null
}

/**
 * oneShot 场景下随文本一起发给多模态引擎的图片（base64）。Claude 使用 image content block，
 * Codex 会先写入临时文件再作为 local_image 输入；交互式评审和 oneShot 共用该结构化图片协议。
 * mediaType 只允许 image/jpeg|png|gif|webp，其余类型由 Java 侧过滤掉。
 */
export interface OneShotImage {
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  data: string
}

/**
 * 第三方网关会话的 system 提示 append 词。官方客户端会在底层静默优化 agent 工作流；经第三方 API 直跑时，
 * 非 Claude 模型常把“规划/计划模式”以工具调用形式暴露出来（EnterPlanMode/ExitPlanMode 反复往返、报错），
 * 既慢又易失败。这里追加引导：直接动手、少绕计划模式。append 到 claude_code 预设之后，不替换默认提示。
 */
const GATEWAY_STEER = [
  '你正通过第三方 API 网关运行（非官方 Claude Code 客户端）。请尽量直接完成任务：',
  '- 不要进入/退出“计划模式”，不要调用 ExitPlanMode；需要多步时直接执行并简要说明。',
  '- 避免冗长前言和反复规划，优先动手（读文件、改代码、跑命令），减少无谓的工具往返。',
].join('\n')

/** 福利签收演示会话的引导词：把 agent 锁定在「改演示页文案=改 welfare_sign_config 表」这条最直观、即时可见的路径上。 */
const DEMO_STEER = [
  '你正在「福利签收」受约束演示沙箱中（一次性副本，改动不影响真实环境）。',
  '演示页的文案/外观由数据库表 welfare_sign_config 驱动。要修改演示页内容时，',
  '请直接调用工具 mcp__welfare_db__exec 对 welfare_sign_config 表执行 UPDATE，例如：',
  "UPDATE welfare_sign_config SET detail_title = '中秋福利签收' WHERE id = 1。",
  '可改字段：detail_title（大标题）、detail_content（正文）、popup_title/popup_content（弹框）、',
  'signature_notice（签名提示）、login_mode（SMS/PASSWORD）等。',
  '要改配色/皮肤（如端午绿→国庆红金）时，UPDATE welfare_sign_theme 表（id=1），字段：',
  'accent（强调/图标）、button_bg/button_hover/button_text（按钮）、stage_bg/panel_bg（背景深底）、',
  "eyebrow（顶部小字）、cta_label（领取按钮文案）。例：UPDATE welfare_sign_theme SET accent='#ffd75e', button_bg='#c8102e' WHERE id=1。",
  '要换背景图与聊天框吉祥物，改 welfare_sign_theme 的 backdrop_image / concierge_image 列。两种取值：',
  "① 用现成资源 URL：国庆 '/assets/welfare-sign/national-bg.svg'、'/assets/welfare-sign/national-concierge.svg'；",
  "端午 '/assets/welfare-sign/duanwu-bg.svg'、'/assets/welfare-sign/duanwu-concierge.svg'。",
  '② 自己创作（灵活度更高，推荐用于新主题）：直接把你写的原始 SVG 标记（以 <svg 开头）存进该列，',
  '后端会自动包成 data URI 即时渲染，无需落文件。背景图按 viewBox 0 0 1600 1000、吉祥物按 0 0 200 200 设计。',
  '务必用参数化把 SVG 放进 params 数组（避免引号转义与校验误判），例：',
  "sql=\"UPDATE welfare_sign_theme SET backdrop_image = ? WHERE id = 1\"，params=[\"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 1000'>…</svg>\"]。",
  '创作 SVG 时遵循上面的美学北极星：高级暗色、克制配色、避免廉价渐变。',
  '',
  '【分区块精调】产品哲学是「分模块处理」：背景、文本框、字体分开调，不同文本块可有不同字号/字重/颜色。',
  '页面在展开对话框时会显示 A/B/C… 角标，对应可独立调样式的区块（登录前主画面）：',
  '- A = 顶部 eyebrow 小字；B = 主标题；C = 正文段落；',
  '- D = 右侧「确认身份」面板容器；E = 输入框区；F = 领取按钮。',
  '用户常会说「把 B 改大一点 / C 用更细的字 / A 换成金色」这类指向某区块的诉求。',
  '区块样式存在 welfare_sign_theme.blocks_json 列，是一个 JSON 对象：键为区块 ID，值为样式覆盖，',
  '支持字段：color、fontWeight（如 300/600/800）、fontSize（如 "5rem"/"120px"）、letterSpacing（如 "0.06em"）、fontFamily。',
  '只需写要改的区块与字段，其余沿用皮肤默认。务必整列覆盖式写回（先读旧值再合并），用参数化避免转义，例：',
  'sql="UPDATE welfare_sign_theme SET blocks_json = ? WHERE id = 1"，',
  'params=["{\\"B\\":{\\"fontSize\\":\\"8rem\\",\\"fontWeight\\":800},\\"C\\":{\\"color\\":\\"#cbb48a\\",\\"fontWeight\\":300}}"]。',
  '注意：blocks_json 是逐区块的精细字体/颜色覆盖，整体配色仍走 accent/button_*/stage_bg/panel_bg；两者配合用。',
  '',
  '【美学北极星】这是一个世界级奢侈品「礼遇」体验，不是后台/电商/表单。每次改文案与配色都向它靠拢：',
  '- 标杆：Linear 的视觉精度、爱马仕的奢侈感、Apple 级打磨；全屏沉浸、电影级开场感、超大字号、极简信息。',
  '- 情感优先：文案写「被赠予的心意与仪式感」，不写交易/操作步骤；detail_title 用大字短句，detail_content 一两句克制而动人。',
  '- 高级暗色：stage_bg/panel_bg 用深邃低饱和底色，accent 作克制点缀（金/单一品牌色），按钮沉稳；留白充足。',
  '- 禁忌：仪表盘/管理后台/电商风、廉价刺眼渐变、信息堆砌、多色乱用。配色宁少勿杂、宁雅勿艳。',
  '改完简要说明即可，页面会自动刷新。',
  '约束：只能操作 welfare_sign_* 表（含 welfare_sign_theme）与副本目录内的文件，不要尝试其它表、命令或网络。',
].join('\n')

// Claude 模型清单按 provider 分别缓存：官方 supportedModels 与各第三方网关 /v1/models 是不同清单，
// 绝不能共用一份全局缓存（否则官方刷新/官方↔三方互切会把对方清单覆盖，前端显示错 provider 的模型）。
// key = provider 标识（'official' 或网关 baseUrl），供该 provider 的会话 start/resume/switch 即时重发。
const claudeModelsByProvider = new Map<string, unknown[]>()
let claudeWarmStarted = false

/** provider 缓存 key：官方登录用 'official'，第三方网关用其 baseUrl（去空白）。 */
function providerKey(apiBaseUrl?: string): string {
  return apiBaseUrl?.trim() || 'official'
}

/** 查询官方模型时的干净环境：剔除 shell 可能预置的 ANTHROPIC 网关变量，保证问的是官方而非三方。 */
function officialModelsEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.ANTHROPIC_BASE_URL
  delete env.ANTHROPIC_AUTH_TOKEN
  delete env.ANTHROPIC_API_KEY
  return env
}

function isCodexReasoningEffort(value: unknown): value is CodexReasoningEffort {
  return typeof value === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(value)
}

function normalizeConsultEvidenceSystems(values: readonly string[] | undefined): string[] {
  const allowed = new Set(['erp', 'srm', 'scm'])
  return [...new Set((values ?? [])
    .map(value => value.trim().toLowerCase())
    .filter(value => allowed.has(value)))]
}

/** 中断时留给「未决审批的 deny 响应」写回 CLI 的时间，之后才关传输层。见 Session.interrupt()。 */
const INTERRUPT_DENY_FLUSH_MS = 30
const TURN_ACTIVITY_HEARTBEAT_MS = 5_000

export function loadCodexModels(sessionCodexHome?: string): CodexModelInfo[] {
  try {
    const codexHome = normalizeCodexHome(sessionCodexHome)
      ?? normalizeCodexHome(process.env.CODEX_HOME)
      ?? join(homedir(), '.codex')
    const raw = JSON.parse(readFileSync(join(codexHome, 'models_cache.json'), 'utf8')) as {
      models?: Array<{
        slug?: string
        display_name?: string
        description?: string
        visibility?: string
        default_reasoning_level?: string
        supported_reasoning_levels?: Array<{ effort?: string }>
        additional_speed_tiers?: string[]
      }>
    }
    return (raw.models ?? []).flatMap((model) => {
      const value = model.slug?.trim()
      if (!value || model.visibility !== 'list') return []
      return [{
        value,
        displayName: model.display_name?.trim() || value,
        description: model.description ?? '',
        reasoningEfforts: (model.supported_reasoning_levels ?? [])
          .map((level) => level.effort)
          .filter(isCodexReasoningEffort),
        defaultReasoningEffort: isCodexReasoningEffort(model.default_reasoning_level)
          ? model.default_reasoning_level
          : null,
        fastSupported: (model.additional_speed_tiers ?? []).includes('fast'),
        isDefault: false,
      }]
    })
  } catch (error) {
    console.warn('[sidecar] 读取 Codex 模型缓存失败:', error instanceof Error ? error.message : String(error))
    return []
  }
}

/**
 * 建一次性 query 仅发控制请求 supportedModels 取模型清单，拿到即 abort，绝不跑对话轮次。
 * 这是「向 claude 原生二进制问一次当前支持的模型」的底层动作——Claude Code 会自更新，
 * 二进制在磁盘上升级后支持的模型会变（如新增 Sonnet 5），故本函数每次都真实重新询问。
 */
async function queryClaudeModels(env?: NodeJS.ProcessEnv): Promise<unknown[] | null> {
  const ac = new AbortController()
  const safeCwd = process.env.USERPROFILE || process.env.HOME || process.cwd()
  try {
    const q = query({
      prompt: 'warmup',
      // 传 env 时问的是该 provider（网关或官方）的模型清单；不传则沿用进程环境。
      options: { cwd: safeCwd, permissionMode: 'default', abortController: ac, ...(env ? { env } : {}) },
    } as never)
    const fn = (q as { supportedModels?: () => Promise<unknown> }).supportedModels
    if (typeof fn !== 'function') return null
    const models = await fn.call(q)
    return Array.isArray(models) ? models : null
  } finally {
    ac.abort() // 取消一次性 query，绝不真正处理 warmup 这轮
  }
}

/**
 * 启动预热：取一次模型清单填充全局缓存，消除「sidecar 重启后首次进会话、未发消息 → 模型组空」的冷启动窗口。
 * 失败静默（首轮对话仍会再取）。
 */
async function prewarmClaudeModels(): Promise<void> {
  if (claudeModelsByProvider.has('official') || claudeWarmStarted) return
  claudeWarmStarted = true
  try {
    const models = await queryClaudeModels(officialModelsEnv())
    if (models) {
      claudeModelsByProvider.set('official', models)
      console.log(`[sidecar] 预热官方 Claude 模型清单：${models.length} 个`)
    }
  } catch (e) {
    console.warn('[sidecar] 预热 Claude 模型失败（首轮对话会再取）：', e instanceof Error ? e.message : String(e))
  }
}

/**
 * 强制重新询问指定 provider 的支持模型并刷新其缓存（无视既有缓存）。用于「主动同步」按钮与定时同步。
 * key/env 决定问的是官方还是某网关——各 provider 独立缓存，互不覆盖。成功返回清单，失败返回 null（保留旧缓存）。
 */
async function refreshClaudeModels(key: string, env?: NodeJS.ProcessEnv): Promise<unknown[] | null> {
  try {
    const models = await queryClaudeModels(env)
    if (models) {
      claudeModelsByProvider.set(key, models)
      console.log(`[sidecar] 刷新模型清单[${key}]：${models.length} 个`)
      return models
    }
    console.warn(`[sidecar] 刷新模型[${key}]：未取到清单，保留旧缓存`)
    return null
  } catch (e) {
    console.warn(`[sidecar] 刷新模型[${key}]失败（保留旧缓存）：`, e instanceof Error ? e.message : String(e))
    return null
  }
}

/** 单会话：持有 SDK session_id、当前轮的 AbortController、权限交互。 */
class Session {
  sdkSessionId?: string
  model?: string
  codexReasoningEffort?: CodexReasoningEffort
  codexSpeed: CodexSpeed = 'default'
  /** 第三方网关 baseURL（Anthropic 兼容）。仅本会话生效——置则每轮 query 注入 env，不影响其它会话/官方登录。 */
  apiBaseUrl?: string
  /** 第三方网关鉴权 token（走 ANTHROPIC_API_KEY）。 */
  authToken?: string
  /** Codex 官方登录配置根目录；空值使用默认 ~/.codex。 */
  codexHome?: string
  /** 会话引擎，新建时定、resume 沿用；决定 runTurn 走 Claude 还是 Codex。 */
  engine: Engine = 'claude'
  /** 会话级权限模式，每轮 query 传入；运行中切换下一轮生效。 */
  permissionMode = 'default'
  /** 一次性分析可设 disabled，移除 Claude 内置工具与设置源。 */
  toolPolicy = 'default'
  /** 后端会话快照授权的跨系统只读证据范围。 */
  consultEvidenceSystems: string[] = []
  /** 仅真实交互会话启用；one-shot 后台任务的 id 不是持久会话，不能写会话 SQL 台账。 */
  forgeSqlRegistration = true
  /** 会话级「弹窗自动允许」兜底开关，与 permissionMode 独立；见 Permissions.autoApprove 说明。 */
  autoApprove = false
  /** 福利签收演示会话：开启后注入受限 welfare_db MCP，权限走 perms 的 demo 沙箱硬裁决。 */
  demo = false
  /** demo 的 welfare_db 工具回灌后端的基址（如 http://127.0.0.1:18080）。 */
  demoApiBase?: string
  private abort?: AbortController
  private readonly turnLifecycle = new TurnLifecycle()
  private readonly engineRegistry: EngineAdapterRegistry
  private readonly mcpToolWatchdog: McpToolWatchdog
  private readonly toolExecutionWatchdog: ToolExecutionWatchdog
  private pendingMcpRecovery?: { entry: McpToolWatchdogEntry; call: ReadonlyKnowledgeMcpCall }
  private mcpRecoveryAttempted = false
  private turnActivityStartedAt = 0
  private turnActivityPhase = 'starting'
  private turnActivityTitle = '正在启动代码引擎'
  private turnActivityDetail?: string
  private turnActivityTimer?: NodeJS.Timeout
  private modelsFetched = false
  /** 本轮 API 响应里实际返回的模型（来自 assistant message.model，权威）；用于调用诊断。 */
  private lastResponseModel?: string
  /** 本轮最后一条带文本的 Claude assistant message UUID，用作回答底部分叉锚点。 */
  private lastAssistantForkAnchor?: string
  /** 本轮已完成消息的累计输出 token（跨 tool-use 多段），配合当前消息的 output_tokens 得到实时总量。 */
  private turnBaseTokens = 0
  private curMsgTokens = 0
  /** 本轮是否已见过 SDK 的 result 消息；用于流异常收尾（未发 result）时补发，避免前端永久「思考中」。 */
  private turnHadResult = false
  /** 最近一次主会话 SDK init 的能力快照；供用户主动刷新面板时无模型调用地重发。 */
  private capabilities: CapabilitySnapshot = {
    slashCommands: [],
    skills: [],
    agents: [],
    mcpServers: [],
    outputStyle: null,
  }
  /**
   * 该会话当前存活的后台任务快照（Agent 工具后台化的子任务）。SDK 用 REPLACE 语义整体下发
   * （system/background_tasks_changed），收到即整体覆盖，不需要自己配对 start/end 事件——
   * 空数组即代表当前没有后台任务在跑。主回合的 result 事件只代表"这一轮可见回复结束了"，
   * 不代表会话触发的所有后台工作都结束；这份状态就是用来区分这两者的。
   */
  backgroundTasks: Array<{ taskId: string; taskType: string; description: string }> = []
  readonly perms: Permissions

  constructor(
    readonly id: string,
    public cwd: string,
    private readonly emitRaw: (e: Record<string, unknown>) => void,
  ) {
    this.perms = new Permissions(event => this.emitTurn(event))
    this.engineRegistry = createBuiltinEngineRegistry({
      claude: request => this.runClaudeTurn(
        request.text,
        request.systemPrompt,
        request.images as OneShotImage[] | undefined,
        request.developerInstructions,
        [...request.additionalDirectories],
      ),
      codex: request => this.runCodexTurn(
        request.text,
        request.developerInstructions,
        request.images as OneShotImage[] | undefined,
      ),
      antigravity: request => this.runAntigravityTurn(
        request.text,
        request.developerInstructions,
        [...request.additionalDirectories],
      ),
      opencode: request => this.runOpencodeTurn(request.text, request.developerInstructions),
    }, async () => { this.abort?.abort() })
    const deepSeekConfig = { ...deepSeekHarnessConfigFromEnv(), cwd: this.cwd }
    if (deepSeekConfig.enabled) {
      this.engineRegistry.register(new DeepSeekHarnessAdapter(deepSeekConfig))
    }
    this.mcpToolWatchdog = new McpToolWatchdog({
      timeoutMs: configuredMcpToolTimeoutMs(),
      heartbeatMs: configuredMcpToolHeartbeatMs(),
      maxDurationMs: configuredMcpToolMaxDurationMs(),
      onHeartbeat: entry => this.emitMcpToolHeartbeat(entry),
      onTimeout: entry => this.handleMcpToolTimeout(entry),
    })
    this.toolExecutionWatchdog = new ToolExecutionWatchdog({
      idleTimeoutMs: configuredToolExecutionIdleTimeoutMs(),
      heartbeatMs: configuredToolExecutionHeartbeatMs(),
      maxDurationMs: configuredToolExecutionMaxDurationMs(),
      onHeartbeat: entry => this.emitToolExecutionHeartbeat(entry),
      onTimeout: entry => this.handleToolExecutionTimeout(entry),
    })
  }

  private emitTurn(event: Record<string, unknown>): void {
    const type = typeof event.type === 'string' ? event.type : ''
    // result 只是引擎流终态；整轮还要经过 finally 清理，不能在这里提前显示“已结束”。
    if (type !== 'result') this.updateTurnActivity(event)
    this.mcpToolWatchdog.observe(event)
    if (this.engine === 'codex') this.toolExecutionWatchdog.observe(event)
    const wasTerminal = this.turnLifecycle.terminal()
    const decorated = this.turnLifecycle.decorate(event)
    if (type === 'result' && !wasTerminal && this.turnLifecycle.terminal()) {
      this.setTurnActivityPhase('finalizing', '正在收口当前轮次')
    }
    if (decorated) this.emitRaw(decorated)
  }

  private startTurnActivity(): void {
    this.clearTurnActivityTimer()
    this.turnActivityStartedAt = Date.now()
    this.turnActivityPhase = 'starting'
    this.turnActivityTitle = '正在启动代码引擎'
    this.turnActivityDetail = undefined
    this.emitTurnActivity('inProgress')
    this.turnActivityTimer = setInterval(() => this.emitTurnActivity('inProgress'), TURN_ACTIVITY_HEARTBEAT_MS)
    this.turnActivityTimer.unref?.()
  }

  private updateTurnActivity(event: Record<string, unknown>): void {
    if (!this.turnActivityTimer || event.type === 'turnActivity') return
    const type = typeof event.type === 'string' ? event.type : ''
    if (type === 'assistantDelta') {
      this.setTurnActivityPhase('generating', '正在生成回复')
    } else if (type === 'toolUse') {
      const toolName = typeof event.toolName === 'string' ? event.toolName : '工具'
      this.setTurnActivityPhase('tool', '正在执行工具', toolName)
    } else if (type === 'toolResult') {
      this.setTurnActivityPhase('thinking', '正在处理工具结果')
    } else if (type === 'permissionRequest' || type === 'questionRequest') {
      this.setTurnActivityPhase('waiting', '正在等待你的确认')
    } else if (type === 'codexActivity' && event.status !== 'completed') {
      const title = typeof event.title === 'string' && event.title.trim() ? event.title : '正在处理任务'
      this.setTurnActivityPhase('working', title)
    }
  }

  private setTurnActivityPhase(phase: string, title: string, detail?: string): void {
    if (phase === this.turnActivityPhase && title === this.turnActivityTitle && detail === this.turnActivityDetail) return
    this.turnActivityPhase = phase
    this.turnActivityTitle = title
    this.turnActivityDetail = detail
    this.emitTurnActivity('inProgress')
  }

  private emitTurnActivity(status: 'inProgress' | 'completed'): void {
    if (!this.turnActivityStartedAt) return
    const decorated = this.turnLifecycle.decorate({
      type: 'turnActivity',
      status,
      phase: status === 'completed' ? 'completed' : this.turnActivityPhase,
      title: status === 'completed' ? '本轮已结束' : this.turnActivityTitle,
      detail: status === 'completed' ? undefined : this.turnActivityDetail,
      elapsedMs: Date.now() - this.turnActivityStartedAt,
    })
    if (decorated) this.emitRaw(decorated)
  }

  private stopTurnActivity(): void {
    if (!this.turnActivityStartedAt) return
    this.clearTurnActivityTimer()
    this.emitTurnActivity('completed')
    this.turnActivityStartedAt = 0
    this.turnActivityDetail = undefined
  }

  private clearTurnActivityTimer(): void {
    if (this.turnActivityTimer) clearInterval(this.turnActivityTimer)
    this.turnActivityTimer = undefined
  }

  private emitMcpToolHeartbeat(entry: McpToolWatchdogEntry): void {
    emitToolActivity(event => this.emitTurn({ ...event, watchdogGenerated: true }), {
      toolCallId: entry.toolCallId,
      toolName: entry.toolName,
      status: 'inProgress',
      title: 'MCP 工具执行中',
      detail: [entry.lastTitle, entry.lastDetail,
        `无活动上限 ${Math.round(entry.timeoutMs / 1_000)} 秒`,
        `总时长上限 ${Math.round(entry.maxDurationMs / 1_000)} 秒`].filter(Boolean).join(' · '),
      elapsedMs: Date.now() - entry.startedAt,
      outcome: 'waiting',
      severity: 'info',
    })
  }

  private emitToolExecutionHeartbeat(entry: ToolExecutionWatchdogEntry): void {
    emitToolActivity(event => this.emitTurn({ ...event, watchdogGenerated: true }), {
      toolCallId: entry.toolCallId,
      toolName: entry.toolName,
      status: 'inProgress',
      title: '工具仍在执行',
      detail: [entry.lastDetail || entry.lastTitle,
        `无活动上限 ${Math.round(entry.idleTimeoutMs / 1_000)} 秒`,
        `总时长上限 ${Math.round(entry.maxDurationMs / 1_000)} 秒`].filter(Boolean).join(' · '),
      elapsedMs: Date.now() - entry.startedAt,
      outcome: 'waiting',
      severity: 'info',
    })
  }

  private handleToolExecutionTimeout(entry: ToolExecutionWatchdogEntry): void {
    const elapsedMs = Date.now() - entry.startedAt
    const hardLimit = entry.timeoutReason === 'maxDuration'
    const limitMs = hardLimit ? entry.maxDurationMs : entry.idleTimeoutMs
    const message = `工具 ${entry.toolName}${hardLimit ? '执行总时长' : '与本轮均无有效进度'}超过 ${Math.round(limitMs / 1_000)} 秒，已终止当前轮次`
    console.warn(`[sidecar] tool execution timeout session=${this.id} tool=${entry.toolName} call=${entry.toolCallId} reason=${entry.timeoutReason ?? 'idle'} elapsedMs=${elapsedMs}`)
    this.emitTurn({
      type: 'toolResult',
      toolCallId: entry.toolCallId,
      toolName: entry.toolName,
      output: message,
      isError: true,
      watchdogGenerated: true,
    })
    emitToolActivity(event => this.emitTurn({ ...event, watchdogGenerated: true }), {
      toolCallId: entry.toolCallId,
      toolName: entry.toolName,
      status: 'failed',
      title: '工具执行超时',
      detail: message,
      elapsedMs,
      outcome: 'timeout',
      severity: 'error',
    })
    this.emitTurn({ type: 'error', code: 'TOOL_EXECUTION_TIMEOUT', message })
    this.abort?.abort(new ToolExecutionTimeoutAbort(entry))

    const fallback = setTimeout(() => {
      if (!this.turnLifecycle.terminal()) {
        this.emitTurn({ type: 'result', usage: {}, stopReason: 'error' })
      }
    }, 2_000)
    fallback.unref?.()
  }

  private handleMcpToolTimeout(entry: McpToolWatchdogEntry): void {
    const recoveryCall = this.engine === 'codex' && !this.mcpRecoveryAttempted
      ? readonlyKnowledgeMcpCall(entry.toolName, entry.toolInput)
      : undefined
    if (recoveryCall) {
      this.pendingMcpRecovery = { entry, call: recoveryCall }
      const elapsedMs = Date.now() - entry.startedAt
      console.warn(`[sidecar] read-only MCP channel timeout; isolating call session=${this.id} tool=${entry.toolName} call=${entry.toolCallId}`)
      emitToolActivity(event => this.emitTurn({ ...event, watchdogGenerated: true }), {
        toolCallId: entry.toolCallId,
        toolName: entry.toolName,
        status: 'inProgress',
        title: 'MCP 通道超时，正在隔离恢复',
        detail: '当前 App Server 正在终止；Forge 将通过新进程重试这次只读查询。',
        elapsedMs,
        outcome: 'retrying',
        severity: 'warning',
      })
      this.emitTurn({
        type: 'warning',
        code: 'MCP_TOOL_RECOVERING',
        message: `只读 MCP 工具 ${entry.toolName} 响应超时，正在隔离重试；不会重放整轮开发操作。`,
      })
      this.abort?.abort(new McpToolTimeoutAbort(entry))
      return
    }
    this.failMcpToolTimeout(entry)
  }

  private failMcpToolTimeout(entry: McpToolWatchdogEntry, recoveryError?: string): void {
    const elapsedMs = Date.now() - entry.startedAt
    const hardLimit = entry.timeoutReason === 'maxDuration'
    const limitSeconds = Math.round((hardLimit ? entry.maxDurationMs : entry.timeoutMs) / 1_000)
    const phase = entry.lastDetail || entry.lastTitle
    const message = recoveryError
      ? `MCP 工具 ${entry.toolName} 隔离重试失败，已结束当前任务：${recoveryError}`
      : `MCP 工具 ${entry.toolName}${hardLimit ? '执行总时长' : '无有效进度'}超过 ${limitSeconds} 秒，已取消当前任务${phase ? `；最后阶段：${phase}` : ''}`
    console.warn(`[sidecar] MCP tool timeout session=${this.id} engine=${this.engine} tool=${entry.toolName} call=${entry.toolCallId} reason=${entry.timeoutReason ?? 'idle'} elapsedMs=${elapsedMs} lastPhase=${phase ?? '-'}`)
    this.emitTurn({
      type: 'toolResult',
      toolCallId: entry.toolCallId,
      toolName: entry.toolName,
      output: message,
      isError: true,
      watchdogGenerated: true,
    })
    emitToolActivity(event => this.emitTurn({ ...event, watchdogGenerated: true }), {
      toolCallId: entry.toolCallId,
      toolName: entry.toolName,
      status: 'failed',
      title: 'MCP 工具响应超时',
      detail: message,
      elapsedMs,
      outcome: 'timeout',
      severity: 'error',
    })
    this.emitTurn({ type: 'error', code: 'MCP_TOOL_TIMEOUT', message })
    this.abort?.abort(this.engine === 'codex' ? new McpToolTimeoutAbort(entry) : undefined)

    const fallback = setTimeout(() => {
      if (!this.turnLifecycle.terminal()) {
        this.emitTurn({ type: 'result', usage: {}, stopReason: 'error' })
      }
    }, 2_000)
    fallback.unref?.()
  }

  private consumePendingMcpRecovery(): { entry: McpToolWatchdogEntry; call: ReadonlyKnowledgeMcpCall } | undefined {
    const recovery = this.pendingMcpRecovery
    this.pendingMcpRecovery = undefined
    return recovery
  }

  /**
   * 跑一轮：把用户消息交给 SDK，流式回吐事件。resume 续跑靠 sdkSessionId。
   *
   * 对「启动 native 二进制失败」做有限重试：该二进制有 200MB+，首次启动可能被
   * 杀软实时扫描短暂锁住而 spawn 失败。只在本轮尚未产出任何消息时重试，避免重复输出。
   */
  async runTurn(text: string, systemPrompt?: string, images?: OneShotImage[],
                developerInstructions?: string, requestedTurnId?: string,
                additionalDirectories: string[] = []): Promise<void> {
    const turn = this.turnLifecycle.begin(requestedTurnId)
    if (!turn.accepted) {
      this.emitRaw({
        type: 'error',
        code: 'TURN_BUSY',
        message: '上一轮仍在收口，请稍后重试',
        turnId: turn.turnId,
        activeTurnId: turn.blockingTurnId,
      })
      this.emitRaw({ type: 'result', usage: {}, stopReason: 'error', turnId: turn.turnId })
      return
    }
    this.mcpToolWatchdog.clear()
    this.toolExecutionWatchdog.clear()
    this.pendingMcpRecovery = undefined
    this.mcpRecoveryAttempted = false
    this.startTurnActivity()
    try {
      let nextText = text
      let nextImages = images
      while (true) {
        await this.executeTurn(nextText, systemPrompt, nextImages, developerInstructions, additionalDirectories)
        const recovery = this.consumePendingMcpRecovery()
        if (!recovery) break

        this.mcpRecoveryAttempted = true
        this.mcpToolWatchdog.clear()
        const recoveryAbort = new AbortController()
        this.abort = recoveryAbort
        try {
          this.setTurnActivityPhase('tool-recovery', '正在恢复 MCP 只读查询', recovery.entry.toolName)
          const result = await retryReadonlyKnowledgeMcp(recovery.call, undefined, undefined, recoveryAbort.signal)
          const output = typeof result === 'string' ? result : JSON.stringify(result) ?? String(result)
          this.emitTurn({
            type: 'toolResult',
            toolCallId: recovery.entry.toolCallId,
            toolName: recovery.entry.toolName,
            output,
            isError: false,
            watchdogGenerated: true,
          })
          emitToolActivity(event => this.emitTurn({ ...event, watchdogGenerated: true }), {
            toolCallId: recovery.entry.toolCallId,
            toolName: recovery.entry.toolName,
            status: 'completed',
            title: 'MCP 只读查询已恢复',
            detail: '已在隔离进程中取得结果，Codex 正从中断点继续。',
            outputTail: activityOutputTail(result),
            outcome: 'recovered',
            severity: 'success',
          })
          nextText = knowledgeMcpRecoveryPrompt(recovery.call, result)
          nextImages = undefined
        } catch (error) {
          if (recoveryAbort.signal.aborted) break
          this.failMcpToolTimeout(
            recovery.entry,
            error instanceof Error ? error.message : String(error),
          )
          break
        } finally {
          if (this.abort === recoveryAbort) this.abort = undefined
        }
      }
    } catch (error) {
      console.error(`[sidecar] turn failed session=${this.id} turn=${turn.turnId}:`, error)
      this.emitTurn({
        type: 'error',
        code: 'TURN_FAILED',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      this.mcpToolWatchdog.clear()
      this.toolExecutionWatchdog.clear()
      if (!this.turnLifecycle.terminal()) {
        this.emitTurn({
          type: 'result',
          usage: {},
          stopReason: this.turnLifecycle.fallbackStopReason(),
        })
      }
      this.stopTurnActivity()
      const settledResult = this.turnLifecycle.finish(turn.turnId)
      // result 的协议语义是“本轮已彻底结束且可以接收下一轮”，必须在 finish 之后发布。
      if (settledResult) this.emitRaw(settledResult)
    }
  }

  private executeTurn(text: string, systemPrompt?: string, images?: OneShotImage[],
                      developerInstructions?: string, additionalDirectories: string[] = []): Promise<void> {
    return this.engineRegistry.runTurn(this.engine, {
      sessionId: this.id,
      turnId: this.turnLifecycle.snapshot().activeTurnId ?? 'unknown',
      text,
      systemPrompt,
      images: images as EngineImageInput[] | undefined,
      developerInstructions,
      additionalDirectories,
      signal: this.abort?.signal,
      emit: event => this.emitEngineEvent(event),
    })
  }

  private emitEngineEvent(event: import('./engine/engineContract.js').AgentEvent): void {
    if (event.type === 'assistant.delta' && typeof event.payload.text === 'string') {
      this.emitTurn({ type: 'assistantDelta', text: event.payload.text })
    }
    if (event.type === 'tool.started') {
      const toolCallId = typeof event.payload.toolCallId === 'string' ? event.payload.toolCallId : event.eventId
      const toolName = typeof event.payload.toolName === 'string' ? event.payload.toolName : 'tool'
      this.emitTurn({ type: 'toolUse', toolCallId, toolName, input: event.payload.input ?? {} })
      this.emitTurn({
        type: 'toolActivity', toolCallId, toolName, status: 'inProgress',
        title: `${toolName} 执行中`, detail: 'DeepSeek Harness 正在调用工具',
      })
    }
    if (event.type === 'tool.completed') {
      const toolCallId = typeof event.payload.toolCallId === 'string' ? event.payload.toolCallId : event.eventId
      const toolName = typeof event.payload.toolName === 'string' ? event.payload.toolName : 'tool'
      const output = typeof event.payload.output === 'string' ? event.payload.output : ''
      const isError = event.payload.isError === true
      this.emitTurn({ type: 'toolResult', toolCallId, toolName, output, isError })
      this.emitTurn({
        type: 'toolActivity', toolCallId, toolName, status: 'completed',
        title: isError ? `${toolName} 未通过` : `${toolName} 已完成`, outputTail: output,
        outcome: isError ? 'failed' : 'success', severity: isError ? 'warning' : 'neutral',
      })
    }
    this.emitTurn({ type: 'engineEvent', engineEvent: publicAgentEvent(event) })
  }

  private async runClaudeTurn(text: string, systemPrompt?: string, images?: OneShotImage[],
                              developerInstructions?: string, additionalDirectories: string[] = []): Promise<void> {
    const maxAttempts = 3
    // spawn claude.exe 时若 working dir 不存在会直接「exists but failed to launch」；
    // cwd 失效（历史会话来自已删除/改名/异机路径）则回退到用户主目录，避免起不来。
    const safeCwd = existsSync(this.cwd) ? this.cwd : (process.env.USERPROFILE || process.env.HOME || process.cwd())
    if (safeCwd !== this.cwd) {
      console.warn(`[sidecar] 会话 cwd 不存在，回退到 ${safeCwd}（原 cwd: ${this.cwd}）`)
    }
    // 带图片时 prompt 不能是纯字符串，要构造成 SDKUserMessage（text block + image block 混排），
    // 才能让 Claude 真正"看到"图片内容而不只是收到一段文字。每次重试都要拿到全新的生成器实例——
    // 异步生成器只能消费一次，若在循环外只建一次、复用同一个实例，第二次重试会拿到已耗尽的迭代器。
    const buildPrompt = (): string | AsyncIterable<Record<string, unknown>> => {
      if (!images || images.length === 0) return text
      return (async function* () {
        yield {
          type: 'user' as const,
          message: {
            role: 'user' as const,
            content: [
              { type: 'text' as const, text },
              ...images.map((img) => ({
                type: 'image' as const,
                source: { type: 'base64' as const, media_type: img.mediaType, data: img.data },
              })),
            ],
          },
          parent_tool_use_id: null,
        }
      })()
    }
    this.lastResponseModel = undefined
    this.lastAssistantForkAnchor = undefined
    this.turnBaseTokens = 0
    this.curMsgTokens = 0
    this.turnHadResult = false
    // 调用诊断日志：本轮发出去的模型 + 是否经第三方网关（排查“真走三方 / 回退官方”的关键）
    console.log(`[sidecar] turn start session=${this.id} model=${this.model ?? '默认'} via=${this.apiBaseUrl ?? '官方登录'}`)
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const ac = new AbortController()
      this.abort = ac
      const toolNames = new Map<string, string>() // tool_use_id -> 工具名
      const toolStartedAt = new Map<string, number>()
      let emitted = false
      let nativeStderr = ''

      // MCP：演示会话注入 welfare_db（改数据唯一通道）；普通 Claude 会话若后端就绪(TOOLBOX_API_BASE)
      // 注入【只读】erp_db（查 ERP 测试库核对逻辑）+ erp_app（自闭环验证实发 *.action）；
      // 未配置库/实例时工具自会回"未配置"，无害。
      const mcpServers: Record<string, ReturnType<typeof createWelfareDbServer>> = {}
      if (this.toolPolicy !== 'disabled' && this.toolPolicy !== 'review-only' && this.demo && this.demoApiBase) {
        mcpServers.welfare_db = createWelfareDbServer(this.id, this.demoApiBase)
      }
      const toolboxApiBase = process.env.TOOLBOX_API_BASE
      if (this.toolPolicy !== 'disabled' && this.toolPolicy !== 'review-only' && !this.demo && toolboxApiBase) {
        const consultTargets = new Set(resolveConsultTargetSystems(this.cwd, this.consultEvidenceSystems))
        const canRead = (system: 'erp' | 'srm' | 'scm'): boolean =>
          this.toolPolicy !== 'consult-readonly' || consultTargets.has(system)
        if (this.forgeSqlRegistration) {
          mcpServers.forge = createForgePendingSqlServer(this.id, toolboxApiBase)
        }
        if (canRead('erp')) mcpServers.erp_db = createErpDbServer(toolboxApiBase)
        // 业务咨询只读策略只注入数据库查询工具和 Forge SQL 台账；可真实写测试环境的 app 工具仅限普通开发会话。
        if (this.toolPolicy !== 'consult-readonly') {
          // 自闭环验证：非 demo、后端就绪时挂 erp_app（登录态实发 *.action 探测改动效果；
          // 未配置本地实例时工具自会回"未配置"，无害）。与只读 erp_db 配合：erp_app 触发、erp_db 回读。
          mcpServers.erp_app = createErpAppServer(toolboxApiBase)
        }
        // SRM 需求开发同款一对：srm_db（MySQL 只读查库核对）+ srm_app（yudao 网关 OAuth2 登录态实发验证）。
        // 未配置对应库/实例时工具自会回"未配置"，无害；「SRM需求开发」触发语显式点名这两个工具。
        if (canRead('srm')) mcpServers.srm_db = createSrmDbServer(toolboxApiBase)
        if (this.toolPolicy !== 'consult-readonly') {
          mcpServers.srm_app = createSrmAppServer(toolboxApiBase)
        }
        // SCM 需求开发：只挂只读 scm_db（MySQL 查库核对）；无 scm_app——SCM 暂无像 ERP/SRM 那样
        // 可供登录态实发的网关/接口约定，验证口径改为「重启后查库回读」。未配置库时工具自会回"未配置"，无害。
        if (canRead('scm')) mcpServers.scm_db = createScmDbServer(toolboxApiBase)
      }
      if (this.toolPolicy === 'consult-readonly') {
        const sourceServer = createClaudeConsultSourceServer(this.cwd, this.consultEvidenceSystems)
        if (sourceServer) (mcpServers as Record<string, unknown>)['consult-readonly'] = sourceServer
      }

      // 业务知识图谱：domain-knowledge（业务规则/状态机/公式）+ cross-topology（枚举值/API路径/表字段）
      // 与 claude mcp add 注册相同引擎，通过环境变量 DOMAIN_KB_DIR / CROSS_TOPO_KB_DIR 指定知识库目录。
      // 可选：若引擎或目录不存在则跳过（零影响，工具列表为空时 Claude 不会尝试调用）。
      //
      // PRD 一次性任务仍由 Java GraphifyQueryService 预查询；业务咨询则通过 consult-readonly
      // 的 source_context 以固定参数执行 `graphify query`，从 URL/图谱上下文收敛候选源码。
      // 该入口不开放任意 Bash，也不允许模型直接扫描 graphify-out/cache。
      if (this.toolPolicy !== 'disabled' && this.toolPolicy !== 'review-only') {
        const domainKb = createDomainKnowledgeServer()
        const crossTopo = createCrossTopologyServer()
        if (domainKb) (mcpServers as Record<string, unknown>)['domain-knowledge'] = domainKb
        if (crossTopo) (mcpServers as Record<string, unknown>)['cross-topology'] = crossTopo
      }

      try {
        const q = query({
          prompt: buildPrompt(),
          options: {
            // 仅 oneShot 传：作为真正的 system 提示（字符串=替换 SDK 默认 system）。
            // 交互式聊天 runTurn：官方会话走 SDK 默认；第三方网关会话在默认提示后 append 引导词
            // （非 Claude 模型经 API 跑 Claude Code 时会乱用计划模式/ExitPlanMode，慢且易报错）。
            ...(systemPrompt
              ? { systemPrompt: appendWindowsExecutionInstructions(systemPrompt) }
              : this.demo
                ? { systemPrompt: { type: 'preset', preset: 'claude_code', append: DEMO_STEER } }
                : {
                    systemPrompt: {
                      type: 'preset',
                      preset: 'claude_code',
                      append: [windowsExecutionInstructions() ?? '', this.apiBaseUrl ? GATEWAY_STEER : '',
                        toolboxApiBase && this.forgeSqlRegistration ? FORGE_PENDING_SQL_STEER : '',
                        developerInstructions ?? '']
                        .filter(Boolean).join('\n\n'),
                    },
                  }),
            // 第三方网关 + 非 plan 模式：禁用 ExitPlanMode，杜绝“进/退计划模式”的无谓往返与校验报错。
            // plan 模式是用户主动选的，保留。官方会话不动。
            ...(this.apiBaseUrl && this.permissionMode !== 'plan'
              ? { disallowedTools: ['ExitPlanMode'] }
              : {}),
            ...(this.toolPolicy === 'disabled' || this.toolPolicy === 'review-only'
              ? { tools: [], settingSources: [] }
              : {}),
            ...(this.toolPolicy === 'consult-readonly'
              ? {
                  allowedTools: [
                    'Read', 'AskUserQuestion',
                    'mcp__consult-readonly__source_context',
                    'mcp__consult-readonly__source_search',
                    'mcp__consult-readonly__source_read',
                    'mcp__consult-readonly__erp_standby_schema_search',
                    'mcp__consult-readonly__erp_standby_validate_sql',
                    'mcp__forge__prepare_sql_context',
                    'mcp__forge__register_pending_sql',
                    'mcp__erp_db__query', 'mcp__srm_db__query', 'mcp__scm_db__query',
                    ...DOMAIN_KNOWLEDGE_READONLY_TOOLS
                      .map(tool => `mcp__domain-knowledge__${tool}`),
                    ...CROSS_TOPOLOGY_READONLY_TOOLS
                      .map(tool => `mcp__cross-topology__${tool}`),
                  ],
                }
              : {}),
            ...(Object.keys(mcpServers).length ? { mcpServers } : {}),
            cwd: safeCwd,
            ...(additionalDirectories.length ? { additionalDirectories } : {}),
            model: this.model || undefined,
            resume: this.sdkSessionId || undefined,
            permissionMode: this.permissionMode,
            includePartialMessages: true,
            canUseTool: this.perms.canUseTool,
            abortController: ac,
            // 网关会话注入 env（SDK 的 env 会整体替换子进程环境，故 spread process.env 再覆盖）。
            // 官方会话也必须显式传 env：把可能从 sidecar 进程继承来的 ANTHROPIC_BASE_URL/AUTH_TOKEN/API_KEY
            // 剔除掉——否则运行后端的 shell 若设过这些（为让 CLI 走三方），「切回官方」会因继承脏环境而仍走三方。
            env: this.apiBaseUrl ? this.gatewayEnv() : this.officialEnv(),
            // 把 native 二进制的 stderr 透到 sidecar 日志，失败时也并入错误信息
            stderr: (s: string) => {
              nativeStderr += s
              process.stderr.write('[claude-native] ' + s)
            },
          },
        } as never)

        this.fetchModels(q)

        for await (const m of q as AsyncIterable<Record<string, unknown>>) {
          emitted = true
          this.handle(m, toolNames, toolStartedAt)
        }
        // 流正常结束但未见 result（异常收尾/流提前结束）：补发一条，解除前端永久「思考中」。
        if (!this.turnHadResult) {
          console.warn(`[sidecar] 本轮流结束但未见 result，补发以解除前端「思考中」 session=${this.id}`)
          this.emitTurn({ type: 'result', usage: {}, stopReason: 'end_turn' })
        }
        return
      } catch (e: unknown) {
        if (ac.signal.aborted) {
          this.emitTurn({ type: 'result', usage: {}, stopReason: 'interrupted' })
          return
        }
        const message = e instanceof Error ? e.message : String(e)

        // SDK 会话丢失（sidecar 重启后内存清空，旧 sdkSessionId 不再有效）：
        // 清掉失效的 sdkSessionId，下次循环以 resume:undefined 起一个新会话，
        // 用户的消息照常发出去，整个恢复对前端完全透明（不报错、不需用户介入）。
        if (message.includes('No conversation found') && this.sdkSessionId && !emitted && attempt < maxAttempts) {
          console.warn(`[sidecar] SDK 会话 ${this.sdkSessionId} 不存在，清除并以新会话重试 session=${this.id}`)
          this.sdkSessionId = undefined
          continue
        }

        const launchFailure = /failed to launch|spawn|ENOENT|EACCES|EPERM/i.test(message)
        if (launchFailure && !emitted && attempt < maxAttempts) {
          console.error(`[sidecar] 启动 Claude 失败(第 ${attempt}/${maxAttempts} 次)，1.5s 后重试：${message}`)
          await delay(1500)
          continue
        }
        const detail = nativeStderr.trim() ? `${message}（${nativeStderr.trim().slice(-300)}）` : message
        this.emitTurn({ type: 'error', code: 'QUERY_FAILED', message: detail })
        return
      } finally {
        this.abort = undefined
      }
    }
  }

  /** 跑一轮 Codex：委托 codexEngine 翻译事件流，AbortController 支持中断。 */
  private async runCodexTurn(text: string, developerInstructions?: string, images?: OneShotImage[]): Promise<void> {
    const ac = new AbortController()
    this.abort = ac
    try {
      await runCodexTurn({
        sessionId: this.id,
        text,
        cwd: this.cwd,
        model: this.model,
        reasoningEffort: this.codexReasoningEffort,
        speed: this.codexSpeed,
        permissionMode: this.permissionMode,
        toolPolicy: this.toolPolicy,
        forgeSqlRegistration: this.forgeSqlRegistration,
        developerInstructions,
        images,
        consultEvidenceSystems: this.consultEvidenceSystems,
        sdkSessionId: this.sdkSessionId,
        apiBaseUrl: this.apiBaseUrl,
        authToken: this.authToken,
        codexHome: this.codexHome,
        signal: ac.signal,
        emit: (e) => this.emitTurn(e),
        setSdkSessionId: (id) => { this.sdkSessionId = id },
        canUseTool: this.perms.canUseTool,
      })
    } finally {
      this.abort = undefined
    }
  }

  /** 跑一轮 OpenCode：委托 opencodeEngine（多 provider agent），AbortController 支持中断。 */
  private async runOpencodeTurn(text: string, developerInstructions?: string): Promise<void> {
    const ac = new AbortController()
    this.abort = ac
    try {
      await runOpencodeTurn({
        text,
        developerInstructions,
        cwd: this.cwd,
        model: this.model,
        sdkSessionId: this.sdkSessionId,
        signal: ac.signal,
        emit: (e) => this.emitTurn(e),
        setSdkSessionId: (id) => { this.sdkSessionId = id },
        permissionMode: this.permissionMode,
        autoApprove: this.autoApprove,
        toolPolicy: this.toolPolicy,
      })
    } finally {
      this.abort = undefined
    }
  }

  /** 首轮取一次可用模型清单（SDK 控制请求 supportedModels），按 provider 缓存避免重复；失败静默。 */
  private fetchModels(q: unknown): void {
    if (this.modelsFetched) return
    this.modelsFetched = true
    const fn = (q as { supportedModels?: () => Promise<unknown> }).supportedModels
    if (typeof fn !== 'function') return
    const key = providerKey(this.apiBaseUrl) // 存到当前 provider 的缓存槽，不污染其它 provider
    Promise.resolve(fn.call(q))
      .then((models) => {
        if (Array.isArray(models)) {
          claudeModelsByProvider.set(key, models)
          this.emitTurn({ type: 'models', models, current: this.model ?? null })
        }
      })
      .catch((e) => console.warn('[sidecar] supportedModels 失败:', e instanceof Error ? e.message : String(e)))
  }

  /** 切换 provider 后调用：使下一轮 runTurn 重新按新 provider 取一次模型清单。 */
  resetModelsFetched(): void { this.modelsFetched = false }

  /**
   * 主动重发会话能力。Codex 的 MCP 是 sidecar 运行时注入，直接按当前配置重新计算；
   * Claude 则重发最近一次 SDK init 快照，下一轮 SDK init 会继续更新该快照。
   */
  refreshCapabilities(): void {
    if (this.engine === 'antigravity') {
      this.emitTurn({
        type: 'init', sdkSessionId: this.sdkSessionId ?? null, slashCommands: [], skills: [], agents: [], mcpServers: [], outputStyle: null,
      })
      void listAntigravityModels()
        .then(models => this.emitTurn({ type: 'models', models, current: this.model ?? null }))
        .catch(error => console.warn(`[sidecar] Antigravity 模型目录暂不可用，保留当前选择：${error instanceof Error ? error.message : String(error)}`))
      return
    }
    if (this.engine === 'deepseekHarness') {
      this.emitTurn({
        type: 'init', sdkSessionId: null, slashCommands: [], skills: [], agents: [], mcpServers: [], outputStyle: null,
      })
      return
    }
    if (this.engine === 'opencode') {
      void emitOpencodeModels(this.cwd, event => this.emitTurn(event), this.model)
      return
    }
    if (this.engine === 'codex') {
      if (!process.env.TOOLBOX_API_BASE) {
        this.emitTurn({
          type: 'error',
          code: 'CAPABILITIES_UNAVAILABLE',
          message: 'sidecar 缺少 TOOLBOX_API_BASE，请重启 kai-toolbox 后端以重新拉起 sidecar',
        })
      }
      this.emitTurn({
        type: 'init',
        sdkSessionId: this.sdkSessionId ?? null,
        slashCommands: [],
        skills: [],
        agents: [],
        mcpServers: codexMcpCapabilities(this.toolPolicy, this.id, this.forgeSqlRegistration),
        outputStyle: null,
      })
      return
    }
    this.emitTurn({ type: 'init', sdkSessionId: this.sdkSessionId ?? null, ...this.capabilities })
  }

  /** Run one Antigravity turn with explicit conversation-id resume. */
  private async runAntigravityTurn(text: string, developerInstructions?: string,
                                   additionalDirectories: string[] = []): Promise<void> {
    const ac = new AbortController()
    this.abort = ac
    try {
      await runAntigravityTurn({
        text,
        developerInstructions,
        additionalDirectories,
        cwd: this.cwd,
        model: this.model,
        reasoningEffort: this.codexReasoningEffort,
        permissionMode: this.permissionMode,
        sdkSessionId: this.sdkSessionId,
        signal: ac.signal,
        emit: event => this.emitTurn(event),
        setSdkSessionId: id => { this.sdkSessionId = id },
      })
    } finally {
      this.abort = undefined
    }
  }

  /** 当前 provider 的子进程环境：第三方走网关 env，否则官方 env（剔除网关变量）。供模型刷新按会话 provider 询问。 */
  providerEnv(): NodeJS.ProcessEnv { return this.apiBaseUrl ? this.gatewayEnv() : this.officialEnv() }

  // 把 SDK 消息翻译成与 Java 约定的事件
  private handle(
    m: Record<string, unknown>,
    toolNames: Map<string, string>,
    toolStartedAt: Map<string, number>,
  ): void {
    const type = m.type as string
    switch (type) {
      case 'system': {
        if (m.subtype === 'init' && m.session_id) {
          // 只在新建会话（sdkSessionId 为空）时更新 session ID，避免 feature-dev 等 plugin
          // 的并行子 agent 也会发 init 事件，把主会话 sdkSessionId 覆盖成子 agent 的 ID，
          // 导致下次续跑时 "No conversation found"（子 agent 的 SDK 会话已结束）。
          const eventSessionId = String(m.session_id)
          const isMainSession = !this.sdkSessionId || this.sdkSessionId === eventSessionId
          if (!this.sdkSessionId) this.sdkSessionId = eventSessionId
          // 无论是主会话还是子 agent，init 事件的能力清单都只在主会话时透传前端
          if (isMainSession) {
            const slashCommands = Array.isArray(m.slash_commands) ? m.slash_commands : []
            const skills = Array.isArray(m.skills) ? m.skills : []
            const agents = Array.isArray(m.agents) ? m.agents : []
            const mcpServers = Array.isArray(m.mcp_servers)
              ? (m.mcp_servers as Array<Record<string, unknown>>).map(s => ({ name: String(s.name ?? ''), status: String(s.status ?? '') }))
              : []
            const outputStyle = typeof m.output_style === 'string' ? m.output_style : null
            this.capabilities = { slashCommands, skills, agents, mcpServers, outputStyle }
            this.emitTurn({ type: 'init', sdkSessionId: this.sdkSessionId, ...this.capabilities })
          }
        } else if (m.subtype === 'background_tasks_changed') {
          // SDK 的 REPLACE 语义：每次都是"当前存活的全量后台任务"，直接整体覆盖，不用配对
          // task_started/task_notification 这类边沿事件——漏掉一个边沿事件也不会导致状态卡死。
          const tasks = Array.isArray(m.tasks) ? (m.tasks as Array<Record<string, unknown>>) : []
          this.backgroundTasks = tasks.map(t => ({
            taskId: String(t.task_id ?? ''),
            taskType: String(t.task_type ?? ''),
            description: String(t.description ?? ''),
          }))
          this.emitTurn({ type: 'backgroundTasks', tasks: this.backgroundTasks })
        }
        break
      }
      case 'stream_event': {
        const ev = m.event as Record<string, unknown> | undefined
        const delta = ev?.delta as Record<string, unknown> | undefined
        if (ev?.type === 'content_block_delta' && delta?.type === 'text_delta') {
          this.emitTurn({ type: 'assistantDelta', text: delta.text as string })
        } else if (ev?.type === 'message_start') {
          // 新一段消息（tool-use 后续跑会开新消息）：把上一段的输出 token 计入基数
          this.turnBaseTokens += this.curMsgTokens
          this.curMsgTokens = 0
        } else if (ev?.type === 'message_delta') {
          // message_delta.usage.output_tokens 为该消息累计输出 token；配合基数得到本轮实时总量
          const ot = (ev.usage as Record<string, unknown> | undefined)?.output_tokens
          if (typeof ot === 'number') {
            this.curMsgTokens = ot
            this.emitTurn({ type: 'turnProgress', outputTokens: this.turnBaseTokens + ot })
          }
        }
        break
      }
      case 'tool_progress': {
        const toolCallId = String(m.tool_use_id ?? '')
        const toolName = String(m.tool_name ?? toolNames.get(toolCallId) ?? 'tool')
        const elapsedSeconds = typeof m.elapsed_time_seconds === 'number' ? m.elapsed_time_seconds : undefined
        emitToolActivity(event => this.emitTurn(event), {
          toolCallId,
          toolName,
          status: 'inProgress',
          elapsedMs: elapsedSeconds == null ? elapsedSince(toolStartedAt.get(toolCallId)) : elapsedSeconds * 1_000,
        })
        break
      }
      case 'assistant': {
        const msg = m.message as Record<string, unknown> | undefined
        // API 响应里的真实模型（权威，非模型自述）——网关把请求路由到哪个上游，这里就是哪个
        const mdl = msg?.model
        if (typeof mdl === 'string' && mdl) this.lastResponseModel = mdl
        const content = msg?.content as Array<Record<string, unknown>> | undefined
        const assistantUuid = typeof m.uuid === 'string' ? m.uuid : undefined
        const hasText = content?.some(b => b.type === 'text' && typeof b.text === 'string' && b.text.length > 0)
        if (assistantUuid && hasText) this.lastAssistantForkAnchor = assistantUuid
        for (const b of content ?? []) {
          if (b.type === 'tool_use') {
            const toolCallId = String(b.id ?? '')
            const toolName = String(b.name ?? 'tool')
            toolNames.set(toolCallId, toolName)
            toolStartedAt.set(toolCallId, Date.now())
            this.emitTurn({ type: 'toolUse', toolCallId, toolName, input: b.input })
            emitToolActivity(event => this.emitTurn(event), {
              toolCallId,
              toolName,
              status: 'inProgress',
              detail: summarizeToolInput(b.input),
              elapsedMs: 0,
            })
          }
        }
        break
      }
      case 'user': {
        const content = (m.message as Record<string, unknown>)?.content as Array<Record<string, unknown>> | undefined
        // 真用户文本回合（带 uuid、非 tool_result、非合成）→ 上报 uuid，供异常清理回退定位
        const uuid = m.uuid as string | undefined
        const isToolResult = Array.isArray(content) && content.some(b => b?.type === 'tool_result')
        if (uuid && !isToolResult && !m.isSynthetic) {
          this.emitTurn({ type: 'userMessage', uuid })
        }
        for (const b of content ?? []) {
          if (b.type === 'tool_result') {
            const toolCallId = String(b.tool_use_id ?? '')
            const toolName = toolNames.get(toolCallId) ?? ''
            const output = stringifyContent(b.content)
            const isError = Boolean(b.is_error)
            const classification = classifyCommandResult(toolName, undefined, output, isError)
            this.emitTurn({
              type: 'toolResult',
              toolCallId,
              toolName,
              output,
              isError,
            })
            emitToolActivity(event => this.emitTurn(event), {
              toolCallId,
              toolName,
              status: isError ? 'failed' : 'completed',
              title: classification?.title,
              elapsedMs: elapsedSince(toolStartedAt.get(toolCallId)),
              outputTail: activityOutputTail(output),
              outcome: classification?.outcome,
              severity: classification?.severity,
            })
            toolStartedAt.delete(toolCallId)
          }
        }
        break
      }
      case 'result': {
        this.turnHadResult = true
        if (m.session_id) this.sdkSessionId = m.session_id as string
        if (this.lastAssistantForkAnchor) {
          this.emitTurn({ type: 'forkAnchor', anchor: this.lastAssistantForkAnchor })
        }
        // 调用诊断：请求模型 vs API 实际返回模型 + 是否经网关，先于 result 发，供前端区块展示
        console.log(`[sidecar] turn done session=${this.id} requested=${this.model ?? '默认'} responded=${this.lastResponseModel ?? '?'} via=${this.apiBaseUrl ?? '官方登录'}`)
        this.emitTurn({
          type: 'turnInfo',
          requestedModel: this.model ?? null,
          responseModel: this.lastResponseModel ?? null,
          viaGateway: !!this.apiBaseUrl,
          baseUrl: this.apiBaseUrl ?? null,
        })
        this.emitTurn({ type: 'result', usage: m.usage ?? {}, stopReason: m.subtype ?? 'end_turn' })
        break
      }
    }
  }

  decide(reqId: string, d: Decision): void {
    if (this.engine === 'opencode') {
      void answerOpencodePermission(this.sdkSessionId, reqId, d.behavior, this.cwd, event => this.emitTurn(event))
      return
    }
    this.perms.resolve(reqId, d)
  }

  /**
   * 中断当前轮。顺序很关键：必须先 rejectAll() 再 abort()。
   *
   * claude.exe 是 SDK 的子进程，工具审批走 stdio 控制流的同步请求——它发出 can_use_tool 后
   * 阻塞等 control_response。abort() 会让 SDK 关掉这条流（Windows 上「杀子进程」就是 stdin.end()），
   * 一旦先 abort，rejectAll() 产生的 deny 响应就再也写不进管道，CLI 只能报
   * 「tool permission stream closed before response received」并把该次调用判为失败。
   * 反过来先 rejectAll()，挂起的 canUseTool 立刻 resolve 成 deny，响应能正常回到 CLI；
   * 短暂延时让 SDK 把 control_response 写出去，最后才关流。
   */
  interrupt(expectedTurnId?: string): InterruptSnapshot {
    const hadPending = this.perms.rejectAll()
    const hadActiveTurn = this.abort != null
    const snapshot = this.turnLifecycle.requestInterrupt(expectedTurnId, hadPending)
    console.log(`[sidecar] interrupt requested session=${this.id} engine=${this.engine} active=${hadActiveTurn} pendingDecision=${hadPending} outcome=${snapshot.outcome} turn=${snapshot.activeTurnId ?? 'none'}`)
    if (snapshot.outcome !== 'accepted') return snapshot
    if (!hadPending) {
      void this.interruptEngine() // 无未决审批，没什么要等的，立刻关
    } else {
      // 有未决审批：让 canUseTool 的续体跑完、SDK 把 deny 的 control_response 写出去，再关传输层。
      // setTimeout(0) 排在整个微任务队列之后，足以覆盖 promise 链；这点延迟对「中断」体感无影响。
      setTimeout(() => { void this.interruptEngine() }, INTERRUPT_DENY_FLUSH_MS)
    }
    const interruptedTurnId = snapshot.activeTurnId
    const fallback = setTimeout(() => {
      const state = this.turnLifecycle.snapshot(interruptedTurnId)
      if (state.outcome !== 'accepted') return
      console.warn(`[sidecar] interrupt terminal timeout session=${this.id} engine=${this.engine} turn=${interruptedTurnId}`)
      this.emitTurn({ type: 'result', usage: {}, stopReason: 'interrupted' })
    }, 4000)
    fallback.unref?.()
    return snapshot
  }

  private async interruptEngine(): Promise<void> {
    try {
      await this.engineRegistry.interrupt(this.engine)
    } catch (error) {
      console.error(`[sidecar] native interrupt failed session=${this.id} engine=${this.engine}:`, error)
      this.emitTurn({
        type: 'error',
        code: 'ENGINE_INTERRUPT_FAILED',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  turnState(expectedTurnId?: string): InterruptSnapshot {
    return this.turnLifecycle.snapshot(expectedTurnId)
  }

  /** 返回指定会话在Sidecar与Agent适配层的实时状态，不触发任何状态迁移。 */
  runtimeState(expectedTurnId?: string): SessionRuntimeSnapshot {
    const turn = this.turnLifecycle.snapshot(expectedTurnId)
    const active = turn.active
    const pendingDecision = this.perms.hasPending()
    const phase = active ? this.turnActivityPhase : undefined
    const engineState = this.engineRegistry.runtimeState(this.engine, {
      active,
      pendingDecision,
      phase,
      hasActiveController: this.abort != null,
    })
    return {
      sessionPresent: true,
      engine: this.engine,
      active,
      pendingDecision,
      backgroundTaskCount: this.backgroundTasks.length,
      activeTurnId: turn.activeTurnId,
      phase,
      agentState: engineState.agentState,
      lastHeartbeatAt: Date.now(),
    }
  }

  private gatewayEnv(): NodeJS.ProcessEnv {
    const key = this.authToken ?? ''
    return {
      ...process.env,
      ANTHROPIC_BASE_URL: this.apiBaseUrl,
      ANTHROPIC_API_KEY: key,
      ANTHROPIC_AUTH_TOKEN: key,
    }
  }

  /**
   * 官方会话的子进程环境：从 sidecar 继承的 process.env 出发，显式删除 ANTHROPIC 网关相关变量，
   * 保证「切回官方」绝不走三方——即便运行后端的 shell 预设了这些变量。其余环境（PATH、官方登录态等）保留。
   */
  private officialEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env }
    delete env.ANTHROPIC_BASE_URL
    delete env.ANTHROPIC_AUTH_TOKEN
    delete env.ANTHROPIC_API_KEY
    return env
  }

  async dispose(): Promise<void> {
    await this.engineRegistry.dispose()
  }
}

/** 多会话路由：一个 sidecar 进程内按 sessionId 管理多个 Session。 */
export class SessionManager {
  private readonly reviewConfiguration = new Map<string, Promise<void>>()
  private sessions = new Map<string, Session>()
  private oneShotControllers = new Map<string, AbortController>()
  private pendingCodexOptions = new Map<string, { reasoningEffort?: CodexReasoningEffort; speed: CodexSpeed }>()

  constructor(private emit: Emit, private readonly engineCatalog?: EngineCatalog) {
    // 启动即预热 Claude 模型清单（控制请求，不跑对话），消除重启后首次进会话的空窗
    void prewarmClaudeModels()
    // 定时同步：Claude Code 会自更新，二进制升级后支持的模型会变。每 6 小时重新询问一次并广播给所有
    // Claude 会话，长时间不重启也能拿到最新清单。unref 避免这个定时器拖住进程退出。
    const timer = setInterval(() => { void this.refreshModels(null) }, 6 * 60 * 60 * 1000)
    if (typeof timer.unref === 'function') timer.unref()
  }

  /**
   * 同步模型清单，**严格按 provider 隔离**，绝不跨 provider 覆盖：
   * - 手动刷新（sessionId 非空）：问的是该会话自己的 provider（官方或其网关），只广播给同 provider 的 Claude 会话；
   * - 定时任务（sessionId 为 null）：只刷新官方，只广播给官方 Claude 会话。第三方按各自会话手动刷新。
   */
  async refreshModels(sessionId: string | null): Promise<void> {
    // 手动刷新：按触发会话的 provider 询问并只广播给同 provider
    if (sessionId) {
      const s = this.sessions.get(sessionId)
      if (s?.engine === 'opencode') {
        await emitOpencodeModels(s.cwd, (event) => this.emit(sessionId, event), s.model)
        return
      }
      if (s?.engine === 'codex') {
        await this.refreshCodexModels(sessionId, s, true)
        return
      }
      if (s?.engine === 'deepseekHarness') {
        this.emit(sessionId, { type: 'models', models: [], current: null })
        return
      }
      if (s?.engine === 'antigravity') {
        try {
          const models = await listAntigravityModels()
          this.emit(sessionId, { type: 'models', models, current: s.model ?? null })
        } catch (error) {
          this.emit(sessionId, {
            type: 'warning',
            code: 'ANTIGRAVITY_MODEL_CATALOG_FALLBACK',
            message: `Antigravity 模型目录暂不可用，已保留当前模型：${error instanceof Error ? error.message : String(error)}`,
          })
        }
        return
      }
      if (s && s.engine === 'claude') {
        const key = providerKey(s.apiBaseUrl)
        const models = await refreshClaudeModels(key, s.providerEnv())
        if (!models) {
          this.emit(sessionId, { type: 'error', code: 'MODELS_REFRESH_FAILED', message: '同步模型清单失败，已保留上次结果（请确认 claude/网关 可用）' })
          return
        }
        for (const [id, sess] of this.sessions) {
          if (sess.engine === 'claude' && providerKey(sess.apiBaseUrl) === key) {
            this.emit(id, { type: 'models', models, current: sess.model ?? null })
          }
        }
        return
      }
      // 会话不在/非 claude：按官方兜底刷新，仅回给触发者
      const models = await refreshClaudeModels('official', officialModelsEnv())
      if (models) this.emit(sessionId, { type: 'models', models, current: null })
      else this.emit(sessionId, { type: 'error', code: 'MODELS_REFRESH_FAILED', message: '同步模型清单失败，已保留上次结果' })
      return
    }
    // 定时任务：只刷新官方，只广播给官方 Claude 会话（第三方不受影响）
    const models = await refreshClaudeModels('official', officialModelsEnv())
    if (!models) return
    for (const [id, s] of this.sessions) {
      if (s.engine === 'claude' && !s.apiBaseUrl) this.emit(id, { type: 'models', models, current: s.model ?? null })
    }
  }

  /** 主动刷新当前会话能力清单，不触发模型调用。 */
  refreshCapabilities(id: string): void {
    const session = this.sessions.get(id)
    if (!session) {
      this.emit(id, { type: 'error', code: 'SESSION_NOT_FOUND', message: '会话不存在，无法刷新能力' })
      return
    }
    session.refreshCapabilities()
  }

  start(id: string, cwd: string, model?: string, mode?: string, engine?: string, apiBaseUrl?: string, authToken?: string, codexHome?: string,
        demo?: boolean, demoApiBase?: string, autoApprove?: boolean, codexReasoningEffort?: string, codexSpeed?: string,
        toolPolicy?: string, consultEvidenceSystems: string[] = []): void {
    if (!this.acceptEngine(id, engine)) return
    const s = new Session(id, cwd || process.env.HOME || process.cwd(), (e) => this.emit(id, e))
    if (model) s.model = model
    if (isEngineId(engine)) s.engine = engine
    if (apiBaseUrl) { s.apiBaseUrl = apiBaseUrl; s.authToken = authToken }
    if (codexHome) s.codexHome = codexHome
    if (mode) { s.permissionMode = mode; s.perms.setMode(mode) }
    if (autoApprove) { s.autoApprove = true; s.perms.setAutoApprove(true) }
    s.toolPolicy = toolPolicy === 'consult-readonly' || toolPolicy === 'review-only' ? toolPolicy : 'default'
    s.consultEvidenceSystems = normalizeConsultEvidenceSystems(consultEvidenceSystems)
    s.perms.setToolPolicy(s.toolPolicy)
    s.codexReasoningEffort = isCodexReasoningEffort(codexReasoningEffort)
      ? codexReasoningEffort
      : undefined
    s.codexSpeed = codexSpeed === 'fast' ? 'fast' : 'default'
    this.applyCodexOptions(id, s)
    // 演示会话：cwd 即副本根，权限走 demo 沙箱硬裁决（忽略 mode），注入 welfare_db。
    if (demo) {
      s.demo = true
      s.demoApiBase = demoApiBase
      s.perms.setDemo(s.cwd)
    }
    this.sessions.set(id, s)
    // 立即回一个 init（sdkSessionId 暂为 null），让前端拿到 Ready 启用输入；
    // 真正的 sdkSessionId 在首轮 system/init 时再次回传。
    this.emit(id, {
      type: 'init',
      sdkSessionId: null,
      ...(s.engine === 'codex' ? { mcpServers: codexMcpCapabilities(s.toolPolicy, s.id, s.forgeSqlRegistration) } : {}),
    })
    this.emitCachedModels(id, s)
    if (s.engine === 'opencode') s.refreshCapabilities()
  }

  /**
   * 恢复会话。mode/autoApprove 必须由 Java 一并回灌：sidecar 重建后 Session 是全新对象，
   * 权限模式会退回 default。以前只靠前端收到 ready 后补发 setMode 纠正，可一旦当时没有浏览器在线
   * （用户切走了页面 / 后端自愈式 resume），模式就长期停在 default——本该「全自动」的会话又开始弹审批，
   * 而弹了也没人看，最终超时 deny 或中断成 stream closed。
   */
  resume(id: string, sdkSessionId: string, cwd: string, engine?: string, apiBaseUrl?: string, authToken?: string, codexHome?: string,
         mode?: string, autoApprove?: boolean, model?: string, codexReasoningEffort?: string, codexSpeed?: string,
         toolPolicy?: string, consultEvidenceSystems: string[] = []): void {
    if (!this.acceptEngine(id, engine)) return
    let s = this.sessions.get(id)
    if (!s) {
      s = new Session(id, cwd, (e) => this.emit(id, e))
      this.sessions.set(id, s)
    }
    if (sdkSessionId) s.sdkSessionId = sdkSessionId
    if (cwd) s.cwd = cwd
    if (isEngineId(engine)) s.engine = engine
    if (apiBaseUrl) { s.apiBaseUrl = apiBaseUrl; s.authToken = authToken }
    s.codexHome = codexHome || undefined
    if (mode) { s.permissionMode = mode; s.perms.setMode(mode) }
    if (autoApprove != null) { s.autoApprove = autoApprove; s.perms.setAutoApprove(autoApprove) }
    s.toolPolicy = toolPolicy === 'consult-readonly' || toolPolicy === 'review-only' ? toolPolicy : 'default'
    s.consultEvidenceSystems = normalizeConsultEvidenceSystems(consultEvidenceSystems)
    s.perms.setToolPolicy(s.toolPolicy)
    s.model = model || undefined
    this.setCodexOptions(id, codexReasoningEffort ?? '', codexSpeed ?? 'default')
    this.applyCodexOptions(id, s)
    if (s.engine === 'codex') {
      this.emit(id, { type: 'init', sdkSessionId: s.sdkSessionId ?? null,
        mcpServers: codexMcpCapabilities(s.toolPolicy, s.id, s.forgeSqlRegistration) })
    }
    this.emitCachedModels(id, s)
    if (s.engine === 'opencode') s.refreshCapabilities()
  }

  /** 按会话当前 provider 即时重发已缓存的 models，让 resume/切会话/切 provider 立刻看到对应清单。
   *  无该 provider 缓存时不发（避免发错 provider 的旧清单）——首轮 runTurn 的 fetchModels 会补上。 */
  private emitCachedModels(id: string, s: Session): void {
    if (s.engine === 'claude') {
      const cached = claudeModelsByProvider.get(providerKey(s.apiBaseUrl))
      if (cached) this.emit(id, { type: 'models', models: cached, current: s.model ?? null })
    } else if (s.engine === 'codex') {
      this.emit(id, { type: 'models', models: loadCodexModels(s.codexHome), current: s.model ?? null })
      if (s.toolPolicy === 'review-only') void this.ensureReviewDefaults(id, s)
      else void this.refreshCodexModels(id, s, false)
    } else if (s.engine === 'antigravity') {
      void listAntigravityModels()
        .then(models => this.emit(id, { type: 'models', models, current: s.model ?? null }))
        .catch(error => console.warn(`[sidecar] Antigravity 模型目录暂不可用 session=${id}，保留当前选择：${error instanceof Error ? error.message : String(error)}`))
    }
  }

  /**
   * 评审会话只保留“使用官方默认”的语义：模型值永远为空，推理强度只接受
   * App Server 对 isDefault=true 模型声明的 defaultReasoningEffort。目录失败时不猜第一项，
   * 留空交给 App Server/SDK 自身默认，并通过非终态告警明确降级状态。
   */
  private ensureReviewDefaults(id: string, session: Session): Promise<void> {
    const existing = this.reviewConfiguration.get(id)
    if (existing) return existing
    const resolving = (async () => {
      session.model = undefined
      session.codexSpeed = 'default'
      session.codexReasoningEffort = undefined
      try {
        const models = await listCodexModels(session.codexHome)
        if (this.sessions.get(id) !== session || session.toolPolicy !== 'review-only') return
        const defaultModel = findDefaultCodexModel(models)
        if (!defaultModel) throw new Error('model/list 未返回 isDefault=true 的模型')
        session.codexReasoningEffort = isCodexReasoningEffort(defaultModel.defaultReasoningEffort)
          ? defaultModel.defaultReasoningEffort
          : undefined
        this.emit(id, { type: 'models', models, current: null })
      } catch (error) {
        if (this.sessions.get(id) !== session) return
        const message = error instanceof Error ? error.message : String(error)
        this.emit(id, {
          type: 'warning', code: 'REVIEW_MODEL_CATALOG_FALLBACK',
          message: `Codex 默认模型目录同步失败；未猜测模型，将由运行通道使用官方默认配置：${message}`,
        })
      }
    })()
    this.reviewConfiguration.set(id, resolving)
    return resolving
  }

  private async refreshCodexModels(id: string, session: Session, reportFailure: boolean): Promise<void> {
    try {
      const models = await listCodexModels(session.codexHome)
      if (models.length === 0) throw new Error('Codex model/list 未返回可选模型')
      if (this.sessions.get(id) !== session || session.engine !== 'codex') return
      this.emit(id, { type: 'models', models, current: session.model ?? null })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[sidecar] Codex model/list 失败，保留缓存目录 session=${id}: ${message}`)
      if (reportFailure && this.sessions.get(id) === session) {
        this.emit(id, {
          type: 'error',
          code: 'MODELS_REFRESH_FAILED',
          message: '同步 Codex 模型清单失败，已保留本地缓存结果',
        })
      }
    }
  }

  user(id: string, text: string, developerInstructions?: string, sessionContext?: string,
       additionalDirectories: string[] = [], turnId?: string, images?: OneShotImage[]): void {
    const s = this.sessions.get(id)
    if (!s) {
      this.emit(id, { type: 'error', code: 'SESSION_NOT_FOUND', message: '会话不存在' })
      return
    }
    // fire-and-forget，但必须收敛异常：runTurn 的非 Claude 引擎分支没有内层 catch，
    // 一旦 reject 会变成 unhandledRejection 拖垮整个 sidecar。这里兜成该会话的 error+result，解除前端「思考中」。
    const restricted = s.toolPolicy === 'consult-readonly' || s.toolPolicy === 'review-only'
    const hiddenInstructions = restricted
      ? developerInstructions?.trim() || undefined
      : sessionContext?.trim() || undefined
    const safeAdditionalDirectories = restricted ? [] : additionalDirectories
    const prepare = s.toolPolicy === 'review-only' ? this.ensureReviewDefaults(id, s) : Promise.resolve()
    prepare.then(() => s.runTurn(text, undefined, images, hiddenInstructions, turnId, safeAdditionalDirectories)).catch((e) => {
      console.error('[sidecar] runTurn 异常（已兜住）session=' + id + ':', e)
      this.emit(id, { type: 'error', code: 'TURN_FAILED', message: e instanceof Error ? e.message : String(e), turnId })
      this.emit(id, { type: 'result', usage: {}, stopReason: 'error', turnId })
    })
  }

  decide(id: string, reqId: string, d: Decision): void {
    this.sessions.get(id)?.decide(reqId, d)
  }

  interrupt(id: string, turnId?: string): InterruptAck {
    const oneShot = this.oneShotControllers.get(id)
    if (oneShot) {
      oneShot.abort()
      return { outcome: 'accepted', active: true, pendingDecision: false, activeTurnId: turnId }
    }
    const session = this.sessions.get(id)
    if (!session) return { outcome: 'sessionNotFound', active: false, pendingDecision: false }
    return session.interrupt(turnId)
  }

  turnState(id: string, turnId?: string): InterruptAck {
    const oneShot = this.oneShotControllers.get(id)
    if (oneShot) {
      return {
        outcome: oneShot.signal.aborted ? 'alreadyStopped' : 'accepted',
        active: !oneShot.signal.aborted,
        pendingDecision: false,
        activeTurnId: turnId,
      }
    }
    const session = this.sessions.get(id)
    if (!session) return { outcome: 'sessionNotFound', active: false, pendingDecision: false }
    return session.turnState(turnId)
  }

  /** 查询持久会话的Sidecar与Agent运行快照。 */
  runtimeState(id: string, turnId?: string): SessionRuntimeSnapshot {
    const oneShot = this.oneShotControllers.get(id)
    if (oneShot) {
      const active = !oneShot.signal.aborted
      return {
        sessionPresent: true,
        active,
        pendingDecision: false,
        backgroundTaskCount: 0,
        activeTurnId: turnId,
        agentState: active ? 'running' : 'idle',
        lastHeartbeatAt: Date.now(),
      }
    }
    const session = this.sessions.get(id)
    if (session) return session.runtimeState(turnId)
    return {
      sessionPresent: false,
      active: false,
      pendingDecision: false,
      backgroundTaskCount: 0,
      agentState: 'unknown',
      lastHeartbeatAt: Date.now(),
    }
  }

  /** 切换会话权限模式，下一轮 runTurn 生效。 */
  setMode(id: string, mode: string): void {
    const s = this.sessions.get(id)
    if (s) {
      s.permissionMode = mode
      s.perms.setMode(mode)
      if (s.engine === 'opencode') updateOpencodePermissionPolicy(s.sdkSessionId, s.permissionMode, s.autoApprove, s.toolPolicy)
    }
  }

  /** 切换「弹窗自动允许」兜底开关，下一次工具调用即生效。 */
  setAutoApprove(id: string, on: boolean): void {
    const s = this.sessions.get(id)
    if (s) {
      s.autoApprove = on
      s.perms.setAutoApprove(on)
      if (s.engine === 'opencode') updateOpencodePermissionPolicy(s.sdkSessionId, s.permissionMode, s.autoApprove, s.toolPolicy)
    }
  }

  /** 切换会话模型，下一轮 runTurn 生效。 */
  setModel(id: string, model: string): void {
    const s = this.sessions.get(id)
    if (s) s.model = model
  }

  setCodexOptions(id: string, reasoningEffort: string, speed: string): void {
    const options = {
      reasoningEffort: isCodexReasoningEffort(reasoningEffort)
      ? reasoningEffort
      : undefined,
      speed: speed === 'fast' ? 'fast' as const : 'default' as const,
    }
    this.pendingCodexOptions.set(id, options)
    const session = this.sessions.get(id)
    if (session) this.applyCodexOptions(id, session)
  }

  private applyCodexOptions(id: string, session: Session): void {
    const options = this.pendingCodexOptions.get(id)
    if (!options) return
    session.codexReasoningEffort = options.reasoningEffort
    session.codexSpeed = options.speed
  }

  /**
   * 会话内切服务商（官方登录 ↔ 第三方网关，或两网关互切）：仅改 apiBaseUrl/authToken，
   * 下一轮 runTurn 即生效（runTurn 每轮动态读这俩字段决定注入 env 与引导词）。sdkSessionId
   * 保持不变 → 沿用同一原生会话续跑（保留上下文）。空 baseUrl＝切回官方登录。
   */
  switchProvider(id: string, apiBaseUrl?: string, authToken?: string): void {
    const s = this.sessions.get(id)
    if (!s) return
    const nextBaseUrl = apiBaseUrl?.trim()
    s.apiBaseUrl = nextBaseUrl || undefined
    s.authToken = nextBaseUrl ? authToken : undefined
    s.resetModelsFetched()        // 换 provider：下一轮重新取新 provider 的模型清单
    this.emitCachedModels(id, s)  // 若新 provider 已有缓存，立刻切显示；否则待首轮补
  }

  /**
   * 会话内切引擎：置新 engine，并把 sdkSessionId 设为 Java 提供的目标句柄
   * （切回曾用引擎＝其原生句柄→resume 续接；首次切到＝空→下一轮起新 SDK 会话）。
   * 各引擎句柄的持久化与查找由 Java 负责（DB engine_sessions），sidecar 只按指令应用。
   */
  switchEngine(id: string, engine: string, sdkSessionId?: string, apiBaseUrl?: string, authToken?: string): void {
    const s = this.sessions.get(id)
    if (!s) return
    if (!isEngineId(engine) || !this.acceptEngine(id, engine)) return
    s.engine = engine
    s.sdkSessionId = sdkSessionId && sdkSessionId.length > 0 ? sdkSessionId : undefined
    const nextBaseUrl = apiBaseUrl?.trim()
    s.apiBaseUrl = nextBaseUrl || undefined
    s.authToken = nextBaseUrl ? authToken : undefined
    s.resetModelsFetched() // 换引擎/provider：下一轮重新取模型清单
    if (s.engine === 'codex') {
      this.emit(id, { type: 'init', sdkSessionId: s.sdkSessionId ?? null,
        mcpServers: codexMcpCapabilities(s.toolPolicy, s.id, s.forgeSqlRegistration) })
    }
    this.emitCachedModels(id, s)
    if (s.engine === 'opencode') s.refreshCapabilities()
  }

  /**
   * 分叉原生会话。Claude 可按消息 UUID 截断；Codex 使用 App Server thread/fork，
   * 当前 UI 先支持完整 thread 分叉。其它引擎必须显式报不支持，不能误走 Claude SDK。
   */
  async forkSession(id: string, upToMessageId?: string): Promise<void> {
    const s = this.sessions.get(id)
    if (!s || !s.sdkSessionId) {
      this.emit(id, { type: 'error', code: 'FORK_FAILED', message: '会话未就绪，无法分叉' })
      return
    }
    try {
      let forkedSessionId: string
      if (s.engine === 'claude') {
        const res = await forkSession(s.sdkSessionId, {
          ...(upToMessageId ? { upToMessageId } : {}),
          dir: s.cwd,
        })
        forkedSessionId = res.sessionId
      } else if (s.engine === 'codex') {
        if (!upToMessageId) {
          this.emit(id, { type: 'error', code: 'FORK_ANCHOR_REQUIRED', message: '缺少 Codex 分叉回合标识' })
          return
        }
        forkedSessionId = await forkCodexThread(s.sdkSessionId, {
          lastTurnId: upToMessageId,
          codexHome: s.codexHome,
        })
      } else {
        this.emit(id, {
          type: 'error',
          code: 'FORK_UNSUPPORTED',
          message: `当前 ${s.engine} 引擎暂不支持原生会话分叉`,
        })
        return
      }
      this.emit(id, { type: 'forked', sdkSessionId: forkedSessionId, cwd: s.cwd, engine: s.engine })
    } catch (e) {
      this.emit(id, { type: 'error', code: 'FORK_FAILED', message: e instanceof Error ? e.message : String(e) })
    }
  }

  async forkReviewThread(sourceThreadId: string, lastTurnId?: string, codexHome?: string): Promise<string> {
    return forkCodexThread(sourceThreadId, { lastTurnId, codexHome })
  }

  drop(id: string): void {
    const session = this.sessions.get(id)
    session?.interrupt()
    void session?.dispose()
    this.sessions.delete(id)
    this.pendingCodexOptions.delete(id)
    this.reviewConfiguration.delete(id)
  }

  private acceptEngine(id: string, engine: unknown): boolean {
    if (!isEngineId(engine)) return true
    if ((engine !== 'deepseekHarness' && engine !== 'antigravity')
        || this.engineCatalog?.selectableNow(engine) === true) return true
    this.emit(id, {
      type: 'error',
      code: 'ENGINE_UNAVAILABLE',
      message: `${engine === 'antigravity' ? 'Antigravity CLI' : 'DeepSeek Harness'} 尚未通过当前 Sidecar 的 Runtime 握手，不能创建或切换会话`,
    })
    return false
  }

  /**
   * 一次性无状态生成：建临时 Session（不入 sessions Map），bypassPermissions，
   * 把 system+user 拼成一个 prompt 跑一轮，复用 Session.handle 逐片 emit assistantDelta + result/error。
   * 用于 PRD 澄清、简历优化等一次性 Agent 任务；可按 toolPolicy 禁用工具，不持久化原生会话。
   */
  async oneShot(
    id: string,
    systemPrompt: string,
    userPrompt: string,
    model?: string,
    engine?: string,
    images?: OneShotImage[],
    options?: {
      cwd?: string
      reasoningEffort?: string
      speed?: string
      apiBaseUrl?: string
      authToken?: string
      codexHome?: string
      toolPolicy?: string
    },
  ): Promise<void> {
    const cwd = options?.cwd || process.env.USERPROFILE || process.env.HOME || process.cwd()
    if (!this.acceptEngine(id, engine)) return
    if (engine === 'codex') {
      const controller = new AbortController()
      this.oneShotControllers.set(id, controller)
      try {
        await runEphemeralCodexTurn({
          text: options?.toolPolicy === 'disabled'
            ? `${systemPrompt}\n\n禁止调用任何工具、命令、网络或文件操作，只能根据消息中提供的证据输出答案。\n\n${userPrompt}`
            : `${systemPrompt}\n\n${userPrompt}`,
          cwd,
          model,
          reasoningEffort: isCodexReasoningEffort(options?.reasoningEffort)
            ? options?.reasoningEffort
            : undefined,
          speed: options?.speed === 'fast' ? 'fast' : 'default',
          apiBaseUrl: options?.apiBaseUrl,
          authToken: options?.authToken,
          codexHome: options?.codexHome,
          images,
          permissionMode: 'bypassPermissions',
          toolPolicy: options?.toolPolicy,
          signal: controller.signal,
          emit: (e) => this.emit(id, e),
          setSdkSessionId: () => {},
        })
      } finally {
        this.oneShotControllers.delete(id)
      }
      return
    }
    const s = new Session(id, cwd, (e) => this.emit(id, e))
    if (isEngineId(engine)) s.engine = engine
    s.forgeSqlRegistration = false
    if (model) s.model = model
    s.apiBaseUrl = options?.apiBaseUrl
    s.authToken = options?.authToken
    s.codexHome = options?.codexHome
    s.codexReasoningEffort = isCodexReasoningEffort(options?.reasoningEffort)
      ? options?.reasoningEffort
      : undefined
    s.codexSpeed = options?.speed === 'fast' ? 'fast' : 'default'
    s.toolPolicy = options?.toolPolicy || 'default'
    s.permissionMode = 'bypassPermissions'
    s.perms.setMode('bypassPermissions')
    // 注册到 sessions map，使 interrupt(id) 能通过标准路径找到并中断 AbortController。
    // finally 保证不论成功/失败/中断都清理，不留僵尸 Session。
    this.sessions.set(id, s)
    try {
      // 角色说明走 SDK 独立 systemPrompt 通道，user 只放任务+原文；仅影响这次一次性 query。
      // images 非空时 Claude 真正"看到"图片内容（base64 image content block），而不只是
      // 收到一段引用文字——供 PRD 澄清工具"直接粘贴图片"场景使用。
      await s.runTurn(userPrompt, systemPrompt, images)
    } finally {
      this.sessions.delete(id)
    }
  }
}

function stringifyContent(content: unknown): string {
  if (content == null) return ''
  if (typeof content === 'string') return truncate(content)
  if (Array.isArray(content)) {
    return truncate(
      content
        .map((b) => (typeof b === 'string' ? b : ((b as Record<string, unknown>)?.text as string) ?? JSON.stringify(b)))
        .join('\n'),
    )
  }
  return truncate(JSON.stringify(content))
}

function truncate(s: string, max = 4000): string {
  return s.length > max ? s.slice(0, max) + '…(truncated)' : s
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
