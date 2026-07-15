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
import { runCodexTurn, type CodexSpeed } from './codexEngine.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'
import { runGeminiTurn } from './geminiEngine.js'
import { runOpencodeTurn } from './opencodeEngine.js'

export type Engine = 'claude' | 'codex' | 'gemini' | 'opencode'

type Emit = (sessionId: string, event: Record<string, unknown>) => void

/**
 * 第三方网关会话的 system 提示 append 词。官方客户端会在底层静默优化 agent 工作流；经第三方 API 直跑时，
 * 非 Claude 模型常把“规划/计划模式”以工具调用形式暴露出来（EnterPlanMode/ExitPlanMode 反复往返、报错），
 * 既慢又易失败。这里追加引导：直接动手、少绕计划模式。append 到 claude_code 预设之后，不替换默认提示。
 */
const GATEWAY_STEER = [
  '你正通过第三方 API 网关运行（非官方 Claude Code 客户端）。请尽量直接完成任务：',
  '- 不要进入/退出“计划模式”，不要调用 ExitPlanMode；需要多步时直接执行并简要说明。',
  '- 避免冗长前言和反复规划，优先动手（读文件、改代码、跑命令），减少无谓的工具往返。',
  '- 遵循当前操作系统的命令习惯（Windows 用 PowerShell）。',
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

// Claude 的 supportedModels 对所有会话是同一份、且很稳定。全局缓存，供任意会话 start/resume 即时重发。
// supportedModels 是控制请求（非对话轮次），故启动时预热一次即可填充——见 prewarmClaudeModels。
let cachedClaudeModels: unknown[] | null = null
let claudeWarmStarted = false

const VALID_CODEX_EFFORTS = new Set<ModelReasoningEffort>(['minimal', 'low', 'medium', 'high', 'xhigh'])

function loadCodexModels(): unknown[] {
  try {
    const raw = JSON.parse(readFileSync(join(homedir(), '.codex', 'models_cache.json'), 'utf8')) as {
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
    return (raw.models ?? [])
      .filter((model) => model.slug && model.visibility !== 'hidden')
      .map((model) => ({
        value: model.slug,
        displayName: model.display_name ?? model.slug,
        description: model.description ?? '',
        reasoningEfforts: (model.supported_reasoning_levels ?? [])
          .map((level) => level.effort)
          .filter((effort): effort is ModelReasoningEffort => !!effort && VALID_CODEX_EFFORTS.has(effort as ModelReasoningEffort)),
        defaultReasoningEffort: VALID_CODEX_EFFORTS.has(model.default_reasoning_level as ModelReasoningEffort)
          ? model.default_reasoning_level
          : null,
        fastSupported: (model.additional_speed_tiers ?? []).includes('fast'),
      }))
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
async function queryClaudeModels(): Promise<unknown[] | null> {
  const ac = new AbortController()
  const safeCwd = process.env.USERPROFILE || process.env.HOME || process.cwd()
  try {
    const q = query({
      prompt: 'warmup',
      options: { cwd: safeCwd, permissionMode: 'default', abortController: ac },
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
  if (cachedClaudeModels || claudeWarmStarted) return
  claudeWarmStarted = true
  try {
    const models = await queryClaudeModels()
    if (models) {
      cachedClaudeModels = models
      console.log(`[sidecar] 预热 Claude 模型清单：${models.length} 个`)
    }
  } catch (e) {
    console.warn('[sidecar] 预热 Claude 模型失败（首轮对话会再取）：', e instanceof Error ? e.message : String(e))
  }
}

/**
 * 强制重新询问 claude 二进制的支持模型并刷新全局缓存（无视既有缓存）。用于「主动同步」按钮与定时同步：
 * Claude Code 自更新后模型清单可能已变，重启前靠本函数拉到最新。成功返回最新清单，失败返回 null（保留旧缓存）。
 */
async function refreshClaudeModels(): Promise<unknown[] | null> {
  try {
    const models = await queryClaudeModels()
    if (models) {
      cachedClaudeModels = models
      console.log(`[sidecar] 刷新 Claude 模型清单：${models.length} 个`)
      return models
    }
    console.warn('[sidecar] 刷新 Claude 模型：未取到清单，保留旧缓存')
    return null
  } catch (e) {
    console.warn('[sidecar] 刷新 Claude 模型失败（保留旧缓存）：', e instanceof Error ? e.message : String(e))
    return null
  }
}

/** 单会话：持有 SDK session_id、当前轮的 AbortController、权限交互。 */
class Session {
  sdkSessionId?: string
  model?: string
  codexReasoningEffort?: ModelReasoningEffort
  codexSpeed: CodexSpeed = 'default'
  /** 第三方网关 baseURL（Anthropic 兼容）。仅本会话生效——置则每轮 query 注入 env，不影响其它会话/官方登录。 */
  apiBaseUrl?: string
  /** 第三方网关鉴权 token（走 ANTHROPIC_API_KEY）。 */
  authToken?: string
  /** 会话引擎，新建时定、resume 沿用；决定 runTurn 走 Claude 还是 Codex。 */
  engine: Engine = 'claude'
  /** 会话级权限模式，每轮 query 传入；运行中切换下一轮生效。 */
  permissionMode = 'default'
  /** 福利签收演示会话：开启后注入受限 welfare_db MCP，权限走 perms 的 demo 沙箱硬裁决。 */
  demo = false
  /** demo 的 welfare_db 工具回灌后端的基址（如 http://127.0.0.1:18080）。 */
  demoApiBase?: string
  private abort?: AbortController
  private modelsFetched = false
  /** 本轮 API 响应里实际返回的模型（来自 assistant message.model，权威）；用于调用诊断。 */
  private lastResponseModel?: string
  /** 本轮已完成消息的累计输出 token（跨 tool-use 多段），配合当前消息的 output_tokens 得到实时总量。 */
  private turnBaseTokens = 0
  private curMsgTokens = 0
  /** 本轮是否已见过 SDK 的 result 消息；用于流异常收尾（未发 result）时补发，避免前端永久「思考中」。 */
  private turnHadResult = false
  readonly perms: Permissions

  constructor(
    readonly id: string,
    public cwd: string,
    private readonly emitSelf: (e: Record<string, unknown>) => void,
  ) {
    this.perms = new Permissions(emitSelf)
  }

  /**
   * 跑一轮：把用户消息交给 SDK，流式回吐事件。resume 续跑靠 sdkSessionId。
   *
   * 对「启动 native 二进制失败」做有限重试：该二进制有 200MB+，首次启动可能被
   * 杀软实时扫描短暂锁住而 spawn 失败。只在本轮尚未产出任何消息时重试，避免重复输出。
   */
  async runTurn(text: string, systemPrompt?: string): Promise<void> {
    if (this.engine === 'codex') return this.runCodexTurn(text)
    if (this.engine === 'gemini') return this.runGeminiTurn(text)
    if (this.engine === 'opencode') return this.runOpencodeTurn(text)
    const maxAttempts = 3
    // spawn claude.exe 时若 working dir 不存在会直接「exists but failed to launch」；
    // cwd 失效（历史会话来自已删除/改名/异机路径）则回退到用户主目录，避免起不来。
    const safeCwd = existsSync(this.cwd) ? this.cwd : (process.env.USERPROFILE || process.env.HOME || process.cwd())
    if (safeCwd !== this.cwd) {
      console.warn(`[sidecar] 会话 cwd 不存在，回退到 ${safeCwd}（原 cwd: ${this.cwd}）`)
    }
    this.lastResponseModel = undefined
    this.turnBaseTokens = 0
    this.curMsgTokens = 0
    this.turnHadResult = false
    // 调用诊断日志：本轮发出去的模型 + 是否经第三方网关（排查“真走三方 / 回退官方”的关键）
    console.log(`[sidecar] turn start session=${this.id} model=${this.model ?? '默认'} via=${this.apiBaseUrl ?? '官方登录'}`)
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const ac = new AbortController()
      this.abort = ac
      const toolNames = new Map<string, string>() // tool_use_id -> 工具名
      let emitted = false
      let nativeStderr = ''

      // MCP：演示会话注入 welfare_db（改数据唯一通道）；普通 Claude 会话若后端就绪(TOOLBOX_API_BASE)
      // 注入【只读】erp_db（查 ERP 测试库核对逻辑）+ erp_app（自闭环验证实发 *.action）；
      // 未配置库/实例时工具自会回"未配置"，无害。
      const mcpServers: Record<string, ReturnType<typeof createWelfareDbServer>> = {}
      if (this.demo && this.demoApiBase) {
        mcpServers.welfare_db = createWelfareDbServer(this.id, this.demoApiBase)
      }
      const toolboxApiBase = process.env.TOOLBOX_API_BASE
      if (!this.demo && toolboxApiBase) {
        mcpServers.erp_db = createErpDbServer(toolboxApiBase)
        // 自闭环验证：非 demo、后端就绪时挂 erp_app（登录态实发 *.action 探测改动效果；
        // 未配置本地实例时工具自会回"未配置"，无害）。与只读 erp_db 配合：erp_app 触发、erp_db 回读。
        mcpServers.erp_app = createErpAppServer(toolboxApiBase)
        // SRM 需求开发同款一对：srm_db（MySQL 只读查库核对）+ srm_app（yudao 网关 OAuth2 登录态实发验证）。
        // 未配置对应库/实例时工具自会回"未配置"，无害；「SRM需求开发」触发语显式点名这两个工具。
        mcpServers.srm_db = createSrmDbServer(toolboxApiBase)
        mcpServers.srm_app = createSrmAppServer(toolboxApiBase)
      }

      try {
        const q = query({
          prompt: text,
          options: {
            // 仅 oneShot 传：作为真正的 system 提示（字符串=替换 SDK 默认 system）。
            // 交互式聊天 runTurn：官方会话走 SDK 默认；第三方网关会话在默认提示后 append 引导词
            // （非 Claude 模型经 API 跑 Claude Code 时会乱用计划模式/ExitPlanMode，慢且易报错）。
            ...(systemPrompt
              ? { systemPrompt }
              : this.demo
                ? { systemPrompt: { type: 'preset', preset: 'claude_code', append: DEMO_STEER } }
                : this.apiBaseUrl
                  ? { systemPrompt: { type: 'preset', preset: 'claude_code', append: GATEWAY_STEER } }
                  : {}),
            // 第三方网关 + 非 plan 模式：禁用 ExitPlanMode，杜绝“进/退计划模式”的无谓往返与校验报错。
            // plan 模式是用户主动选的，保留。官方会话不动。
            ...(this.apiBaseUrl && this.permissionMode !== 'plan'
              ? { disallowedTools: ['ExitPlanMode'] }
              : {}),
            ...(Object.keys(mcpServers).length ? { mcpServers } : {}),
            cwd: safeCwd,
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
          this.handle(m, toolNames)
        }
        // 流正常结束但未见 result（异常收尾/流提前结束）：补发一条，解除前端永久「思考中」。
        if (!this.turnHadResult) {
          console.warn(`[sidecar] 本轮流结束但未见 result，补发以解除前端「思考中」 session=${this.id}`)
          this.emitSelf({ type: 'result', usage: {}, stopReason: 'end_turn' })
        }
        return
      } catch (e: unknown) {
        if (ac.signal.aborted) {
          this.emitSelf({ type: 'result', usage: {}, stopReason: 'interrupted' })
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
        this.emitSelf({ type: 'error', code: 'QUERY_FAILED', message: detail })
        return
      } finally {
        this.abort = undefined
      }
    }
  }

  /** 跑一轮 Codex：委托 codexEngine 翻译事件流，AbortController 支持中断。 */
  private async runCodexTurn(text: string): Promise<void> {
    const ac = new AbortController()
    this.abort = ac
    try {
      await runCodexTurn({
        text,
        cwd: this.cwd,
        model: this.model,
        reasoningEffort: this.codexReasoningEffort,
        speed: this.codexSpeed,
        permissionMode: this.permissionMode,
        sdkSessionId: this.sdkSessionId,
        apiBaseUrl: this.apiBaseUrl,
        authToken: this.authToken,
        signal: ac.signal,
        emit: (e) => this.emitSelf(e),
        setSdkSessionId: (id) => { this.sdkSessionId = id },
      })
    } finally {
      this.abort = undefined
    }
  }

  /** 跑一轮 Gemini：委托 geminiEngine（headless stream-json），AbortController 支持中断。 */
  private async runGeminiTurn(text: string): Promise<void> {
    const ac = new AbortController()
    this.abort = ac
    try {
      await runGeminiTurn({
        text,
        cwd: this.cwd,
        model: this.model,
        permissionMode: this.permissionMode,
        sdkSessionId: this.sdkSessionId,
        apiBaseUrl: this.apiBaseUrl,
        authToken: this.authToken,
        signal: ac.signal,
        emit: (e) => this.emitSelf(e),
        setSdkSessionId: (id) => { this.sdkSessionId = id },
      })
    } finally {
      this.abort = undefined
    }
  }

  /** 跑一轮 OpenCode：委托 opencodeEngine（多 provider agent），AbortController 支持中断。 */
  private async runOpencodeTurn(text: string): Promise<void> {
    const ac = new AbortController()
    this.abort = ac
    try {
      await runOpencodeTurn({
        text,
        cwd: this.cwd,
        model: this.model,
        sdkSessionId: this.sdkSessionId,
        signal: ac.signal,
        emit: (e) => this.emitSelf(e),
        setSdkSessionId: (id) => { this.sdkSessionId = id },
      })
    } finally {
      this.abort = undefined
    }
  }

  /** 首轮取一次可用模型清单（SDK 控制请求 supportedModels），缓存避免重复；失败静默。 */
  private fetchModels(q: unknown): void {
    if (this.modelsFetched) return
    this.modelsFetched = true
    const fn = (q as { supportedModels?: () => Promise<unknown> }).supportedModels
    if (typeof fn !== 'function') return
    Promise.resolve(fn.call(q))
      .then((models) => {
        if (Array.isArray(models)) {
          cachedClaudeModels = models // 全局缓存，供后续会话 start/resume 即时重发
          this.emitSelf({ type: 'models', models, current: this.model ?? null })
        }
      })
      .catch((e) => console.warn('[sidecar] supportedModels 失败:', e instanceof Error ? e.message : String(e)))
  }

  // 把 SDK 消息翻译成与 Java 约定的事件
  private handle(m: Record<string, unknown>, toolNames: Map<string, string>): void {
    const type = m.type as string
    switch (type) {
      case 'system': {
        if (m.subtype === 'init' && m.session_id) {
          // 只在新建会话（sdkSessionId 为空）时更新 session ID，避免 feature-dev 等 plugin
          // 的并行子 agent 也会发 init 事件，把主会话 sdkSessionId 覆盖成子 agent 的 ID，
          // 导致下次续跑时 "No conversation found"（子 agent 的 SDK 会话已结束）。
          const isMainSession = !this.sdkSessionId
          if (isMainSession) {
            this.sdkSessionId = m.session_id as string
          }
          // 无论是主会话还是子 agent，init 事件的能力清单都只在主会话时透传前端
          if (isMainSession) {
            const slashCommands = Array.isArray(m.slash_commands) ? m.slash_commands : []
            const skills = Array.isArray(m.skills) ? m.skills : []
            const agents = Array.isArray(m.agents) ? m.agents : []
            const mcpServers = Array.isArray(m.mcp_servers)
              ? (m.mcp_servers as Array<Record<string, unknown>>).map(s => ({ name: String(s.name ?? ''), status: String(s.status ?? '') }))
              : []
            const outputStyle = typeof m.output_style === 'string' ? m.output_style : null
            this.emitSelf({ type: 'init', sdkSessionId: this.sdkSessionId, slashCommands, skills, agents, mcpServers, outputStyle })
          }
        }
        break
      }
      case 'stream_event': {
        const ev = m.event as Record<string, unknown> | undefined
        const delta = ev?.delta as Record<string, unknown> | undefined
        if (ev?.type === 'content_block_delta' && delta?.type === 'text_delta') {
          this.emitSelf({ type: 'assistantDelta', text: delta.text as string })
        } else if (ev?.type === 'message_start') {
          // 新一段消息（tool-use 后续跑会开新消息）：把上一段的输出 token 计入基数
          this.turnBaseTokens += this.curMsgTokens
          this.curMsgTokens = 0
        } else if (ev?.type === 'message_delta') {
          // message_delta.usage.output_tokens 为该消息累计输出 token；配合基数得到本轮实时总量
          const ot = (ev.usage as Record<string, unknown> | undefined)?.output_tokens
          if (typeof ot === 'number') {
            this.curMsgTokens = ot
            this.emitSelf({ type: 'turnProgress', outputTokens: this.turnBaseTokens + ot })
          }
        }
        break
      }
      case 'assistant': {
        const msg = m.message as Record<string, unknown> | undefined
        // API 响应里的真实模型（权威，非模型自述）——网关把请求路由到哪个上游，这里就是哪个
        const mdl = msg?.model
        if (typeof mdl === 'string' && mdl) this.lastResponseModel = mdl
        const content = msg?.content as Array<Record<string, unknown>> | undefined
        for (const b of content ?? []) {
          if (b.type === 'tool_use') {
            toolNames.set(b.id as string, b.name as string)
            this.emitSelf({ type: 'toolUse', toolName: b.name, input: b.input })
          }
        }
        break
      }
      case 'user': {
        const content = (m.message as Record<string, unknown>)?.content as Array<Record<string, unknown>> | undefined
        // 真用户文本回合（带 uuid、非 tool_result、非合成）→ 上报 uuid，供「从此处分叉」定位
        const uuid = m.uuid as string | undefined
        const isToolResult = Array.isArray(content) && content.some(b => b?.type === 'tool_result')
        if (uuid && !isToolResult && !m.isSynthetic) {
          this.emitSelf({ type: 'userMessage', uuid })
        }
        for (const b of content ?? []) {
          if (b.type === 'tool_result') {
            this.emitSelf({
              type: 'toolResult',
              toolName: toolNames.get(b.tool_use_id as string) ?? '',
              output: stringifyContent(b.content),
              isError: Boolean(b.is_error),
            })
          }
        }
        break
      }
      case 'result': {
        this.turnHadResult = true
        if (m.session_id) this.sdkSessionId = m.session_id as string
        // 调用诊断：请求模型 vs API 实际返回模型 + 是否经网关，先于 result 发，供前端区块展示
        console.log(`[sidecar] turn done session=${this.id} requested=${this.model ?? '默认'} responded=${this.lastResponseModel ?? '?'} via=${this.apiBaseUrl ?? '官方登录'}`)
        this.emitSelf({
          type: 'turnInfo',
          requestedModel: this.model ?? null,
          responseModel: this.lastResponseModel ?? null,
          viaGateway: !!this.apiBaseUrl,
          baseUrl: this.apiBaseUrl ?? null,
        })
        this.emitSelf({ type: 'result', usage: m.usage ?? {}, stopReason: m.subtype ?? 'end_turn' })
        break
      }
    }
  }

  decide(reqId: string, d: Decision): void {
    this.perms.resolve(reqId, d)
  }

  interrupt(): void {
    this.abort?.abort()
    this.perms.rejectAll()
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
}

/** 多会话路由：一个 sidecar 进程内按 sessionId 管理多个 Session。 */
export class SessionManager {
  private sessions = new Map<string, Session>()
  private pendingCodexOptions = new Map<string, { reasoningEffort?: ModelReasoningEffort; speed: CodexSpeed }>()

  constructor(private emit: Emit) {
    // 启动即预热 Claude 模型清单（控制请求，不跑对话），消除重启后首次进会话的空窗
    void prewarmClaudeModels()
    // 定时同步：Claude Code 会自更新，二进制升级后支持的模型会变。每 6 小时重新询问一次并广播给所有
    // Claude 会话，长时间不重启也能拿到最新清单。unref 避免这个定时器拖住进程退出。
    const timer = setInterval(() => { void this.refreshModels(null) }, 6 * 60 * 60 * 1000)
    if (typeof timer.unref === 'function') timer.unref()
  }

  /**
   * 主动/定时同步 Claude 模型清单：重新询问二进制，成功则广播 models 给所有 Claude 会话。
   * sessionId 非空时该会话也会收到（用于按钮触发的即时反馈）；为 null 表示定时任务，广播给全部。
   */
  async refreshModels(sessionId: string | null): Promise<void> {
    const models = await refreshClaudeModels()
    if (!models) {
      // 拉取失败：给触发者回一个提示，不打断（保留旧清单）
      if (sessionId) this.emit(sessionId, { type: 'error', code: 'MODELS_REFRESH_FAILED', message: '同步模型清单失败，已保留上次结果（请确认 claude 可用）' })
      return
    }
    for (const [id, s] of this.sessions) {
      if (s.engine === 'claude') this.emit(id, { type: 'models', models, current: s.model ?? null })
    }
    // 触发会话可能尚未进 sessions（极少数时序），补发一次确保有反馈
    if (sessionId && !this.sessions.has(sessionId)) {
      this.emit(sessionId, { type: 'models', models, current: null })
    }
  }

  start(id: string, cwd: string, model?: string, mode?: string, engine?: string, apiBaseUrl?: string, authToken?: string,
        demo?: boolean, demoApiBase?: string): void {
    const s = new Session(id, cwd || process.env.HOME || process.cwd(), (e) => this.emit(id, e))
    if (model) s.model = model
    if (engine === 'codex' || engine === 'gemini' || engine === 'opencode') s.engine = engine
    if (apiBaseUrl) { s.apiBaseUrl = apiBaseUrl; s.authToken = authToken }
    if (mode) { s.permissionMode = mode; s.perms.setMode(mode) }
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
    this.emit(id, { type: 'init', sdkSessionId: null })
    this.emitCachedModels(id, s)
  }

  resume(id: string, sdkSessionId: string, cwd: string, engine?: string, apiBaseUrl?: string, authToken?: string): void {
    let s = this.sessions.get(id)
    if (!s) {
      s = new Session(id, cwd, (e) => this.emit(id, e))
      this.sessions.set(id, s)
    }
    if (sdkSessionId) s.sdkSessionId = sdkSessionId
    if (cwd) s.cwd = cwd
    if (engine === 'codex' || engine === 'claude' || engine === 'gemini' || engine === 'opencode') s.engine = engine
    if (apiBaseUrl) { s.apiBaseUrl = apiBaseUrl; s.authToken = authToken }
    this.applyCodexOptions(id, s)
    this.emitCachedModels(id, s)
  }

  /** Claude 会话且已有全局缓存时，即时重发 models，让 resume/切会话也能立刻看到模型组。 */
  private emitCachedModels(id: string, s: Session): void {
    if (s.engine === 'claude' && cachedClaudeModels) {
      this.emit(id, { type: 'models', models: cachedClaudeModels, current: s.model ?? null })
    } else if (s.engine === 'codex') {
      this.emit(id, { type: 'models', models: loadCodexModels(), current: s.model ?? null })
    }
  }

  user(id: string, text: string): void {
    const s = this.sessions.get(id)
    if (!s) {
      this.emit(id, { type: 'error', code: 'SESSION_NOT_FOUND', message: '会话不存在' })
      return
    }
    // fire-and-forget，但必须收敛异常：runTurn 的非 Claude 引擎分支（codex/gemini/opencode）没有内层 catch，
    // 一旦 reject 会变成 unhandledRejection 拖垮整个 sidecar。这里兜成该会话的 error+result，解除前端「思考中」。
    s.runTurn(text).catch((e) => {
      console.error('[sidecar] runTurn 异常（已兜住）session=' + id + ':', e)
      this.emit(id, { type: 'error', code: 'TURN_FAILED', message: e instanceof Error ? e.message : String(e) })
      this.emit(id, { type: 'result', usage: {}, stopReason: 'error' })
    })
  }

  decide(id: string, reqId: string, d: Decision): void {
    this.sessions.get(id)?.decide(reqId, d)
  }

  interrupt(id: string): void {
    this.sessions.get(id)?.interrupt()
  }

  /** 切换会话权限模式，下一轮 runTurn 生效。 */
  setMode(id: string, mode: string): void {
    const s = this.sessions.get(id)
    if (s) { s.permissionMode = mode; s.perms.setMode(mode) }
  }

  /** 切换会话模型，下一轮 runTurn 生效。 */
  setModel(id: string, model: string): void {
    const s = this.sessions.get(id)
    if (s) s.model = model
  }

  setCodexOptions(id: string, reasoningEffort: string, speed: string): void {
    const options = {
      reasoningEffort: VALID_CODEX_EFFORTS.has(reasoningEffort as ModelReasoningEffort)
      ? reasoningEffort as ModelReasoningEffort
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
    this.emitCachedModels(id, s)
  }

  /**
   * 会话内切引擎：置新 engine，并把 sdkSessionId 设为 Java 提供的目标句柄
   * （切回曾用引擎＝其原生句柄→resume 续接；首次切到＝空→下一轮起新 SDK 会话）。
   * 各引擎句柄的持久化与查找由 Java 负责（DB engine_sessions），sidecar 只按指令应用。
   */
  switchEngine(id: string, engine: string, sdkSessionId?: string, apiBaseUrl?: string, authToken?: string): void {
    const s = this.sessions.get(id)
    if (!s) return
    if (engine !== 'claude' && engine !== 'codex' && engine !== 'gemini' && engine !== 'opencode') return
    s.engine = engine
    s.sdkSessionId = sdkSessionId && sdkSessionId.length > 0 ? sdkSessionId : undefined
    const nextBaseUrl = apiBaseUrl?.trim()
    s.apiBaseUrl = nextBaseUrl || undefined
    s.authToken = nextBaseUrl ? authToken : undefined
  }

  /** 从某条用户消息分叉出新会话（截到该消息），emit forked 带新 sdkSessionId 给 Java 建会话续跑。 */
  async forkSession(id: string, upToMessageId: string): Promise<void> {
    const s = this.sessions.get(id)
    if (!s || !s.sdkSessionId) {
      this.emit(id, { type: 'error', code: 'FORK_FAILED', message: '会话未就绪，无法分叉' })
      return
    }
    try {
      const res = await forkSession(s.sdkSessionId, { upToMessageId, dir: s.cwd })
      this.emit(id, { type: 'forked', sdkSessionId: res.sessionId, cwd: s.cwd })
    } catch (e) {
      this.emit(id, { type: 'error', code: 'FORK_FAILED', message: e instanceof Error ? e.message : String(e) })
    }
  }

  drop(id: string): void {
    this.sessions.get(id)?.interrupt()
    this.sessions.delete(id)
    this.pendingCodexOptions.delete(id)
  }

  /**
   * 一次性无状态生成：建临时 Session（不入 sessions Map），bypassPermissions，
   * 把 system+user 拼成一个 prompt 跑一轮，复用 Session.handle 逐片 emit assistantDelta + result/error。
   * 用于「高质量」简历优化引擎——Agent 当作更强的 LLM，纯文本进出，不调工具、不接 MCP、不持久化。
   */
  async oneShot(id: string, systemPrompt: string, userPrompt: string, model?: string): Promise<void> {
    const cwd = process.env.USERPROFILE || process.env.HOME || process.cwd()
    const s = new Session(id, cwd, (e) => this.emit(id, e))
    if (model) s.model = model
    s.permissionMode = 'bypassPermissions'
    s.perms.setMode('bypassPermissions')
    // 注册到 sessions map，使 interrupt(id) 能通过标准路径找到并中断 AbortController。
    // finally 保证不论成功/失败/中断都清理，不留僵尸 Session。
    this.sessions.set(id, s)
    try {
      // 角色说明走 SDK 独立 systemPrompt 通道，user 只放任务+原文；仅影响这次一次性 query。
      await s.runTurn(userPrompt, systemPrompt)
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
