import { useCallback, useEffect, useRef, useState } from 'react'
import { emitSessionExpired, ensureFreshToken, getToken, logout, useAuth } from '@/lib/auth'
import type { Attachment, ChatItem, ClientMessage, CodexReasoningEffort, CodexSpeed, ConnState, Engine, ModelInfo, PendingRequest, PermissionMode, ProviderKind, SendAttachment, ServerMessage, TurnDiag } from '../types'
import { loadMessages } from '../api'
import { notifyPrompt } from '../browserNotify'
import { pushDebug } from '../lib/debugLog'
import { playNotifySound } from '../sound'

// 按 sessionId 持久化权限模式，使刷新/放大缩小/重连后该会话仍保持上次选择，而非回退 default。
const VALID_MODES: PermissionMode[] = ['default', 'acceptEdits', 'plan', 'bypassPermissions']
const modeStorageKey = (sid: string) => `kai-toolbox:chat-mode:${sid}`
const codexStorageKey = (sid: string) => `kai-toolbox:codex-options:${sid}`
interface CodexOptions {
  reasoningEffort: CodexReasoningEffort
  speed: CodexSpeed
}
const DEFAULT_CODEX_OPTIONS: CodexOptions = { reasoningEffort: 'low', speed: 'default' }
function loadCodexOptions(sid: string): CodexOptions {
  try {
    const parsed = JSON.parse(localStorage.getItem(codexStorageKey(sid)) ?? '{}') as Partial<CodexOptions>
    const reasoningEffort = ['minimal', 'low', 'medium', 'high', 'xhigh'].includes(parsed.reasoningEffort ?? '')
      ? parsed.reasoningEffort as CodexReasoningEffort
      : DEFAULT_CODEX_OPTIONS.reasoningEffort
    return { reasoningEffort, speed: parsed.speed === 'fast' ? 'fast' : 'default' }
  } catch { return DEFAULT_CODEX_OPTIONS }
}
function loadSavedMode(sid: string): PermissionMode | null {
  try {
    const v = localStorage.getItem(modeStorageKey(sid))
    return v && (VALID_MODES as string[]).includes(v) ? (v as PermissionMode) : null
  } catch {
    return null
  }
}
function saveMode(sid: string, m: PermissionMode): void {
  try { localStorage.setItem(modeStorageKey(sid), m) } catch { /* ignore */ }
}

// 用全局唯一 id（非可重置计数器）：避免 Vite HMR 热更重置模块级计数器后，
// 新消息 id 与 state 中残留的旧消息 id 撞 key（开发期刷屏 React duplicate-key 警告）。
const nextId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `i${crypto.randomUUID()}`
    : `i${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/** 把后端透传的 usage（Map，键值各引擎不一）归一成纯数值表；无有效字段返回 undefined。 */
function normalizeUsage(raw: Record<string, unknown> | undefined): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
  }
  return Object.keys(out).length ? out : undefined
}

/** 待发送队列项：running 期间排队的用户消息。 */
export interface QueuedMessage {
  id: string
  text: string
  attachments?: SendAttachment[]
}

/** 连接后要发出的首个意图（区分新建 / 续跑 / 重连回放）。 */
type Intent =
  | { kind: 'open'; cwd: string; model?: string; mode?: PermissionMode; engine?: Engine; apiBaseUrl?: string; authToken?: string }
  | { kind: 'switch'; sessionId: string }
  | { kind: 'resumeHistory'; sdkSessionId: string; cwd: string }
  | { kind: 'resumeCurrent'; sessionId: string }
  | { kind: 'attach'; sessionId: string; lastEventSeq: number }

export interface UseClaudeChatSocket {
  state: ConnState
  sessionId: string | null
  items: ChatItem[]
  pending: PendingRequest | null
  running: boolean
  errorMessage: string | null
  /** 重连回放出现空洞（部分消息已被服务端缓冲淘汰）时的提示文案；null 表示无 */
  syncWarning: string | null
  /** 关闭同步空洞提示 */
  dismissSyncWarning: () => void
  /** 当前权限模式 */
  mode: PermissionMode
  /** 当前会话可用的 slash 命令清单（来自 SDK init），用于输入框补全 */
  slashCommands: string[]
  /** 当前会话激活的能力（来自 SDK init）：技能 / 子代理 / MCP 服务 / 输出风格 */
  skills: string[]
  agents: string[]
  mcpServers: { name: string; status: string }[]
  outputStyle: string | null
  /** 当前会话可用模型清单（来自 SDK supportedModels） */
  models: ModelInfo[]
  /** 正在主动同步模型清单（重新询问 claude 二进制）；用于按钮转圈/禁用 */
  modelsRefreshing: boolean
  /** 当前模型 value */
  currentModel: string | null
  codexReasoningEffort: CodexReasoningEffort
  codexSpeed: CodexSpeed
  /** 当前会话引擎（来自 Ready），用于「思考中」文案 / 命令菜单按引擎区分 */
  currentEngine: Engine
  /** 当前 Claude 服务商来源：official=Claude Code 官方；thirdParty=第三方 Anthropic 兼容网关 */
  currentProviderKind: ProviderKind
  /** 当前第三方网关 baseURL（仅展示；官方为空） */
  currentProviderBaseUrl: string | null
  /** 调用诊断：每轮「请求模型 vs API 实际返回模型 + 是否经网关」，供第三方会话排查（最新在前）。 */
  providerDiag: TurnDiag[]
  /** 本轮进行中的实时输出 token 数（0=尚无）。 */
  turnTokens: number
  /** 新建会话（可带初始权限模式、引擎、第三方网关 provider；provider 仅 Claude 引擎生效） */
  open: (cwd: string, model?: string, mode?: PermissionMode, engine?: Engine, provider?: { apiBaseUrl?: string; authToken?: string }) => void
  /** 切换权限模式（下一轮生效） */
  setMode: (mode: PermissionMode) => void
  /** 切换模型（下一轮生效） */
  setModel: (model: string) => void
  /** 主动同步模型清单：让 sidecar 重新询问 claude 二进制拉最新型号（Claude Code 自更新后用） */
  refreshModels: () => void
  setCodexOptions: (reasoningEffort: CodexReasoningEffort, speed: CodexSpeed) => void
  /** 会话内切 agent（引擎），同一会话内换 claude/codex/gemini；上下文靠切后另发 seed 带过去 */
  switchEngine: (engine: Engine) => void
  /** 会话内切服务商（官方 ↔ 第三方网关），同一会话与 sdkSessionId 不变，保留上下文；空入参＝切回官方 */
  switchProvider: (provider?: { apiBaseUrl?: string; authToken?: string }) => void
  /** 从某条用户消息分叉出新会话（旧会话保留），完成后自动切到新会话 */
  forkSession: (upToMessageId: string) => void
  /** 切到工具内会话（resume 续跑） */
  switchTo: (sessionId: string, hintRunning?: boolean) => void
  /** 续跑磁盘上的历史会话 */
  resumeHistory: (sdkSessionId: string, cwd: string) => void
  resumeCurrent: () => void
  /** 下发一条用户消息（可带附件） */
  send: (text: string, attachments?: SendAttachment[]) => void
  /** 待发送队列：running 时入队的消息，本轮结束后按序自动发出 */
  queued: QueuedMessage[]
  /** 入队一条待发送消息（running 时排队；空闲时也可入队，会立即触发发送） */
  enqueue: (text: string, attachments?: SendAttachment[]) => void
  /** 移除队列中某条 */
  removeQueued: (id: string) => void
  /** 清空待发送队列 */
  clearQueued: () => void
  /** 回灌权限/提问决策 */
  decide: (msg: Extract<ClientMessage, { type: 'decision' }>) => void
  interrupt: () => void
  /** 当前是否在加载历史 */
  historyLoading: boolean
  /** 是否已无更早历史 */
  historyExhausted: boolean
  /** 加载历史消息：reset=true 进会话取最近一页；否则上拉取更早一页 prepend */
  loadHistory: (reset: boolean) => void
}

export function useClaudeChatSocket(opts?: { demo?: boolean }): UseClaudeChatSocket {
  // demo（受约束免登录演示）：连 /api/claude-chat/demo/ws，不带 token、不自动 attach 重连。
  const demo = opts?.demo ?? false
  const [state, setState] = useState<ConnState>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [items, setItems] = useState<ChatItem[]>([])
  const [pending, setPending] = useState<PendingRequest | null>(null)
  const [running, setRunning] = useState(false)
  const [queued, setQueued] = useState<QueuedMessage[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [syncWarning, setSyncWarning] = useState<string | null>(null)
  const [mode, setModeState] = useState<PermissionMode>('default')
  const [slashCommands, setSlashCommands] = useState<string[]>([])
  const [skills, setSkills] = useState<string[]>([])
  const [agents, setAgents] = useState<string[]>([])
  const [mcpServers, setMcpServers] = useState<{ name: string; status: string }[]>([])
  const [outputStyle, setOutputStyle] = useState<string | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelsRefreshing, setModelsRefreshing] = useState(false)
  const [currentModel, setCurrentModel] = useState<string | null>(null)
  const [codexReasoningEffort, setCodexReasoningEffort] = useState<CodexReasoningEffort>('low')
  const [codexSpeed, setCodexSpeed] = useState<CodexSpeed>('default')
  const [currentEngine, setCurrentEngine] = useState<Engine>('claude')
  const [currentProviderKind, setCurrentProviderKind] = useState<ProviderKind>('official')
  const [currentProviderBaseUrl, setCurrentProviderBaseUrl] = useState<string | null>(null)
  const [providerDiag, setProviderDiag] = useState<TurnDiag[]>([])
  // 本轮进行中的实时输出 token 数（SDK 流式 message_delta 累计），供「进行时」指示器展示。
  const [turnTokens, setTurnTokens] = useState(0)

  const wsRef = useRef<WebSocket | null>(null)
  // 本轮响应延迟测量：发送时刻 + 首 token 时刻（客户端墙钟，TTFT/总耗时）
  const turnStartRef = useRef<number | null>(null)
  const ttftRef = useRef<number | null>(null)
  const intentRef = useRef<Intent | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const lastSeqRef = useRef<number>(0)
  // 服务端会话纪元（来自 Ready.epoch）；变化即后端重启/会话重建 → seq 已复位，需重置去重高水位
  const lastEpochRef = useRef<string | null>(null)
  const manualCloseRef = useRef(false)
  // WS 重连退避计数（onopen 清零）+ 建连中守卫（覆盖「await 续期」异步窗口，防并发叠多条 WS）
  const reconnectAttemptsRef = useRef(0)
  const connectingRef = useRef(false)
  // 鉴权失效检测：openedRef=本次 socket 是否曾成功 OPEN；authFailRef=连续「未 OPEN 就被关」次数
  // （握手被后端鉴权拒绝时浏览器只报 1006，无法区分网络断开，故靠「反复握手前即关」推断为登录失效）；
  // gaveUpRef=已因登录失效停重连（等登录成功后再恢复）；forceRefreshRef=下次连接强制续期一次 token。
  const openedRef = useRef(false)
  const authFailRef = useRef(0)
  const gaveUpRef = useRef(false)
  const forceRefreshRef = useRef(false)
  // 订阅登录态：登录成功后 token 变化 → 若之前因失效停连，则自动恢复重连。
  const { token: sessionToken } = useAuth()
  const sdkSessionIdRef = useRef<string | null>(null)
  const cwdRef = useRef<string>('')
  const shouldLoadHistoryRef = useRef(false)
  const historyBeforeRef = useRef<number | null>(null)
  const historyExhaustedRef = useRef(false)
  const historyLoadingRef = useRef(false)
  const loadHistoryRef = useRef<(reset: boolean) => void>(() => {})
  // applyEvent('forked') 需要切会话，但 switchTo 在其后定义 → 用 ref 解依赖环
  const switchToRef = useRef<(sid: string) => void>(() => {})
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyExhausted, setHistoryExhausted] = useState(false)

  const sendRaw = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      const text = JSON.stringify(msg)
      ws.send(text)
      pushDebug('send', msg.type, text)
      return true
    }
    pushDebug('conn', 'send-skipped', `未连接，未发送 type=${msg.type}`)
    return false
  }, [])

  const applyEvent = useCallback((msg: ServerMessage) => {
    // 诊断开关：F12 里 localStorage.setItem('cc-debug','1') 后，打印每条到达的 WS 事件，
    // 用于区分「事件到了没渲染(seq/render)」还是「事件压根没到(后端未投递)」。默认关，零噪音。
    if (typeof localStorage !== 'undefined' && localStorage.getItem('cc-debug')) {
      // eslint-disable-next-line no-console
      console.log('[cc-ev]', msg.type, 'seq=', (msg as { seq?: number }).seq, 'lastSeq=', lastSeqRef.current, 'epoch=', lastEpochRef.current)
    }
    // 新纪元检测：后端重启/会话重建会让服务端 seq 从头计数。若仍按幂等丢弃，会把重启后的所有消息
    // （含 ready 本身）全部吞掉 → 永远「连接中」、收不到消息。Ready.epoch 标识会话实例，变化即复位去重高水位；
    // 无 epoch 字段（旧后端）时兜底按 ready 的 seq 回退判定。
    if (msg.type === 'ready') {
      const ep = msg.epoch
      if (ep != null && ep !== lastEpochRef.current) { lastSeqRef.current = 0; lastEpochRef.current = ep }
      // 关键兜底：ready 的 seq ≤ 当前去重高水位 = 后端会话实例/seq 已重建回退（后端重启、ctx 从 DB 重新创建等）。
      // 同一会话的 re-ready 其 seq 恒 > 高水位（AtomicLong 单调递增），故此判定只在真回退时成立、不会误触发。
      // 不复位的话，本次连接后续所有 live 事件(低 seq)会被整段误丢 → 表现为「留在会话里一直 XX中、不出内容，
      // 切走再切回(会 reset+重载 transcript)才显示」。这正是该 bug 的根因。
      if (typeof msg.seq === 'number' && msg.seq <= lastSeqRef.current) { lastSeqRef.current = 0 }
    }
    // seq 幂等：已处理过的 seq 直接丢弃，杜绝任何重复投递（HMR 残留 socket、半开连接、
    // 回放与实时重叠、一页多连接）导致的消息重复——尤其 assistantDelta 是累加的，重复必翻倍。
    // seq=0 为连接级提示（error/replayGap 等），不参与去重，始终处理。
    if (typeof msg.seq === 'number' && msg.seq > 0) {
      if (msg.seq <= lastSeqRef.current) {
        // 诊断：正常只应丢弃「回放重叠」的重复事件。若这里频繁丢弃 assistantDelta/result/turnProgress，
        // 说明后端 ctx/seq 复位而 epoch 未同步（live 事件低 seq 被误判为已处理）——这正是「不刷新看不到流式内容」的根因线索。
        console.warn('[claude-chat][seq-drop] 丢弃事件', { type: msg.type, seq: msg.seq, lastSeq: lastSeqRef.current, epoch: lastEpochRef.current })
        return
      }
      lastSeqRef.current = msg.seq
    }
    switch (msg.type) {
      case 'ready':
        sessionIdRef.current = msg.sessionId
        setSessionId(msg.sessionId)
        setState('ready')
        setErrorMessage(null) // sidecar 重连恢复后会重发 ready，借此清掉 SIDECAR_DOWN 横幅
        // 恢复该会话上次的权限模式（按 sessionId 持久化），并同步给 sidecar，
        // 使刷新/放大缩小/重连后不回退 default。
        {
          const savedMode = loadSavedMode(msg.sessionId)
          if (savedMode) {
            setModeState(savedMode)
            sendRaw({ type: 'setMode', mode: savedMode })
          }
        }
        {
          const options = loadCodexOptions(msg.sessionId)
          setCodexReasoningEffort(options.reasoningEffort)
          setCodexSpeed(options.speed)
          if (msg.engine === 'codex') sendRaw({ type: 'setCodexOptions', ...options })
        }
        if (msg.slashCommands) setSlashCommands(msg.slashCommands)
        if (msg.skills) setSkills(msg.skills)
        if (msg.agents) setAgents(msg.agents)
        if (msg.mcpServers) setMcpServers(msg.mcpServers)
        setOutputStyle(msg.outputStyle ?? null)
        if (msg.engine) setCurrentEngine(msg.engine)
        setCurrentProviderKind(msg.providerKind ?? 'official')
        setCurrentProviderBaseUrl(msg.providerBaseUrl ?? null)
        // Codex/Gemini 会话无 Claude 模型/slash 清单：进入时清掉上一个 Claude 会话残留的选项，避免误显示。
        // Claude 会话不清（其 supportedModels 在 sidecar 端缓存，清了 resume 不会再下发）。
        if (msg.engine === 'codex' || msg.engine === 'gemini') {
          if (msg.engine === 'gemini') setModels([])
          setSlashCommands([])
          setCurrentModel(null)
          setSkills([])
          setAgents([])
          setMcpServers([])
        }
        // ready 只用于「关闭」running（会话已非 RUNNING → 纠正卡住的「思考中」），绝不「点亮」：
        // running 仅由用户 send / 切会话 hint 这类明确动作置真。否则反复收到的 ready（重连/sidecar 恢复/
        // 切换 provider 都会重发 ready）里带 RUNNING 会在一轮结束后把 spinner 重新点亮，卡死且新消息被排队。
        if (msg.status && msg.status !== 'RUNNING') setRunning(false)
        if (msg.sdkSessionId) sdkSessionIdRef.current = msg.sdkSessionId
        // 仅 switch / resume 进会话时拉一次历史；新建会话(open，sdkSessionId 为空)不拉
        if (shouldLoadHistoryRef.current && msg.sdkSessionId) {
          shouldLoadHistoryRef.current = false
          loadHistoryRef.current(true)
        }
        break
      case 'assistantDelta':
        if (turnStartRef.current != null && ttftRef.current == null) {
          ttftRef.current = Date.now() - turnStartRef.current
        }
        setItems(prev => {
          const last = prev[prev.length - 1]
          if (last && last.kind === 'assistant') {
            const copy = prev.slice(0, -1)
            return [...copy, { ...last, text: last.text + msg.text }]
          }
          return [...prev, { kind: 'assistant', id: nextId(), text: msg.text, ts: Date.now() }]
        })
        break
      case 'toolUse':
        setItems(prev => [...prev, { kind: 'tool', id: nextId(), toolName: msg.toolName, input: msg.input, ts: Date.now() }])
        break
      case 'toolResult':
        setItems(prev => {
          // 回填最近一个同名、尚无 output 的工具项
          for (let i = prev.length - 1; i >= 0; i--) {
            const it = prev[i]
            if (it.kind === 'tool' && it.toolName === msg.toolName && it.output === undefined) {
              const copy = prev.slice()
              copy[i] = { ...it, output: msg.output, isError: msg.isError }
              return copy
            }
          }
          return [...prev, { kind: 'tool', id: nextId(), toolName: msg.toolName, input: null, output: msg.output, isError: msg.isError, ts: Date.now() }]
        })
        break
      case 'permissionRequest':
        setPending({ kind: 'permission', reqId: msg.reqId, toolName: msg.toolName, input: msg.input })
        notifyPrompt('Claude 需要确认权限', `工具 ${msg.toolName} 正在等待你授权`)
        playNotifySound() // 需要操作,无论前后台都响一声
        break
      case 'questionRequest':
        setPending({ kind: 'question', reqId: msg.reqId, questions: msg.questions })
        notifyPrompt('Claude 有问题等你回答', '请回到对话作答')
        playNotifySound()
        break
      case 'decisionResolved':
        // 另一端已处理同一请求（多端同看）→ 关掉本端弹窗
        setPending(prev => (prev && prev.reqId === msg.reqId ? null : prev))
        break
      case 'models':
        setModels(msg.models)
        setCurrentModel(msg.current)
        setModelsRefreshing(false) // 收到最新清单：结束「同步中」态
        break
      case 'userMessage':
        // 把本轮用户消息的 SDK transcript uuid 挂到最近一条尚未标记的 user 项上，供「从此处分叉」
        setItems(prev => {
          for (let i = prev.length - 1; i >= 0; i--) {
            const it = prev[i]
            if (it.kind === 'user' && !it.sdkUuid) {
              const copy = prev.slice()
              copy[i] = { ...it, sdkUuid: msg.uuid }
              return copy
            }
          }
          return prev
        })
        break
      case 'forked':
        // 分叉完成：切到新会话续跑（旧会话保留）
        switchToRef.current(msg.sessionId)
        break
      case 'replayGap':
        // 重连回放有空洞：中间事件已被服务端缓冲淘汰，本端显示可能不全
        setSyncWarning('部分消息可能未同步（断线较久）。下拉到顶可加载历史，或重进该会话查看完整记录。')
        break
      case 'turnInfo':
        // 调用诊断：记到列表（最新在前，capped），供第三方会话「调用诊断」区块展示
        setProviderDiag(prev => [{
          id: nextId(),
          requestedModel: msg.requestedModel,
          responseModel: msg.responseModel,
          viaGateway: msg.viaGateway,
          baseUrl: msg.baseUrl,
        }, ...prev].slice(0, 30))
        break
      case 'turnProgress':
        setTurnTokens(msg.outputTokens)
        break
      case 'result': {
        setRunning(false)
        const latencyMs = turnStartRef.current != null ? Date.now() - turnStartRef.current : undefined
        const ttftMs = ttftRef.current ?? undefined
        const usage = normalizeUsage(msg.usage)
        turnStartRef.current = null
        ttftRef.current = null
        setItems(prev => [...prev, { kind: 'result', id: nextId(), stopReason: msg.stopReason, ts: Date.now(), usage, latencyMs, ttftMs }])
        // Claude 回复完成:仅当页面不在前台时响一声,避免你正盯着看时反复叮咚
        if (typeof document !== 'undefined' && document.hidden) playNotifySound()
        break
      }
      case 'error':
        setRunning(false)
        setItems(prev => [...prev, { kind: 'error', id: nextId(), code: msg.code, message: msg.message, ts: Date.now() }])
        if (msg.code === 'SIDECAR_DOWN') {
          setErrorMessage(msg.message)
        }
        break
    }
  }, [])

  const flushIntent = useCallback(() => {
    const intent = intentRef.current
    if (!intent) return
    if (intent.kind === 'open') sendRaw({ type: 'open', cwd: intent.cwd, model: intent.model, mode: intent.mode, engine: intent.engine, apiBaseUrl: intent.apiBaseUrl, authToken: intent.authToken })
    else if (intent.kind === 'switch') sendRaw({ type: 'switchSession', sessionId: intent.sessionId })
    else if (intent.kind === 'resumeHistory') sendRaw({ type: 'resumeHistory', sdkSessionId: intent.sdkSessionId, cwd: intent.cwd })
    else if (intent.kind === 'resumeCurrent') sendRaw({ type: 'resumeCurrent', sessionId: intent.sessionId })
    else sendRaw({ type: 'attach', sessionId: intent.sessionId, lastEventSeq: intent.lastEventSeq })
  }, [sendRaw])

  // 断线期间发出的用户消息排这里，重连 attach 后自动补发，避免静默丢失 + “思考中”卡死
  const pendingSendsRef = useRef<{ text: string; attachments?: Attachment[] }[]>([])

  const flushPendingSends = useCallback(() => {
    if (pendingSendsRef.current.length === 0) return
    const queue = pendingSendsRef.current
    pendingSendsRef.current = [] // 先清空再发，防多连接竞态下重复补发
    for (const m of queue) {
      sendRaw({ type: 'send', text: m.text, attachments: m.attachments })
    }
  }, [sendRaw])

  // 用新鲜 token 真正建 WS（已确保 token 续期、并发守卫已置位）。
  const openSocket = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    // WS 握手无法带 Authorization 头，开启鉴权后用 access_token 让 AdminHandshakeInterceptor 校验 ADMIN。
    // demo 通道公开免鉴权（路由不挂拦截器），不带 token。
    const token = demo ? null : getToken()
    const qs = token ? `?access_token=${encodeURIComponent(token)}` : ''
    const path = demo ? '/api/claude-chat/demo/ws' : '/api/claude-chat/ws'
    const url = `${proto}//${window.location.host}${path}${qs}`
    setState('connecting')
    openedRef.current = false // 新一次尝试：先假定未连上，onopen 置真
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0 // 连上即清零退避，下次断线从最短间隔重来
      openedRef.current = true
      authFailRef.current = 0 // 成功握手即清鉴权失败计数
      pushDebug('conn', 'open', `WS 已连接 ${path}`)
      flushIntent()
      flushPendingSends()
    }
    ws.onmessage = ev => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }
      // 调试模式：捕获每条到达的原始报文（node sidecar 事件经后端转发），供「调试模式」弹框查看
      pushDebug('recv', msg.type, typeof ev.data === 'string' ? ev.data : String(ev.data), (msg as { seq?: number }).seq)
      applyEvent(msg)
    }
    ws.onerror = () => {
      setState('error')
      setErrorMessage('WebSocket 连接出错')
      pushDebug('conn', 'error', 'WebSocket 连接出错')
    }
    ws.onclose = () => {
      wsRef.current = null
      pushDebug('conn', 'close', `WS 关闭（openedThisAttempt=${openedRef.current}）`)
      if (manualCloseRef.current) return
      const openedThisAttempt = openedRef.current
      // 「握手前就被关」且本地仍有 token：大概率是后端鉴权拒绝（token 失效）。localhost/同源下网络抖动
      // 通常能完成握手，反复「未 OPEN 即关」几乎只可能是鉴权被拒。累计到阈值即判定登录失效，
      // 停止重连并主动弹登录，根除「拿被拒 token 无限重连刷屏」的僵尸循环。
      if (!demo && !openedThisAttempt && getToken()) {
        const f = (authFailRef.current += 1)
        if (f >= 3) {
          gaveUpRef.current = true
          setState('error')
          setErrorMessage('登录已过期或凭证失效，请重新登录后重试。')
          logout()            // 清掉被拒的 token，避免后续请求继续用它
          emitSessionExpired() // 通知全局守卫弹登录框
          return
        }
        forceRefreshRef.current = true // 下次连接前强制续期一次（治后端重启/时钟偏移导致的旧 token 被拒）
      }
      // 非主动关闭且已有会话：自动重连并 attach 回放（断连不丢消息），按指数退避避免死循环刷屏
      // demo 会话随 WS 断开即被服务端销毁，重连 attach 已无意义；只置 closed。
      if (!demo && sessionIdRef.current) {
        intentRef.current = { kind: 'attach', sessionId: sessionIdRef.current, lastEventSeq: lastSeqRef.current }
        setState('closed')
        const n = (reconnectAttemptsRef.current += 1)
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(n, 5)) + Math.floor(Math.random() * 500)
        setTimeout(() => connect(), delay)
      } else {
        setState('closed')
      }
    }
  }, [applyEvent, flushIntent, flushPendingSends, demo])

  const connect = useCallback(() => {
    // 幂等：已有在连/已连的 socket，或正处于「续期+建连」异步窗口时，不再叠一条。
    // 否则 mount 的 connect() 与 auto-open 的 switchTo()→connect() 会并发各建一条 WS，
    // 两条都被加为服务端 viewer 且共用同一 hook，每条事件被 applyEvent 投递两次 → 消息/结束标记翻倍。
    const existing = wsRef.current
    if (existing && (existing.readyState === WebSocket.CONNECTING || existing.readyState === WebSocket.OPEN)) {
      return
    }
    if (connectingRef.current) return
    // 已因登录失效放弃：不再重连（等登录成功后由 token 变化的 effect 恢复），避免拿被拒 token 空转。
    if (gaveUpRef.current) { setState('error'); return }
    connectingRef.current = true
    setState('connecting')
    // demo：免鉴权，跳过 token 续期，直接建连。
    if (demo) {
      connectingRef.current = false
      if (manualCloseRef.current) return
      const cur = wsRef.current
      if (cur && (cur.readyState === WebSocket.CONNECTING || cur.readyState === WebSocket.OPEN)) return
      openSocket()
      return
    }
    // 重连前先确保 access token 新鲜（过期则用 refresh token 续期）。forceRefresh=true 时强制续期一次，
    // 治「本地以为 token 还新鲜、服务端却已拒」（后端重启/时钟偏移）的握手死循环。
    // 治本：避免「拿过期 token 每秒重连被握手拒」的死循环（实测曾刷 4 万条）。
    const force = forceRefreshRef.current
    forceRefreshRef.current = false
    ensureFreshToken(force).finally(() => {
      connectingRef.current = false
      if (manualCloseRef.current) return
      const cur = wsRef.current
      if (cur && (cur.readyState === WebSocket.CONNECTING || cur.readyState === WebSocket.OPEN)) return
      // 无 token：停止重连（防僵尸循环）。注意此处不主动弹登录——未登录用户（从没有 token）不该被打扰；
      // 真正的「登录失效」弹框由 ensureFreshToken 的 refresh 失败、onclose 反复握手被拒、HTTP 401 触发。
      // 登录后由 sessionToken 变化的 effect 自动恢复重连。
      if (!getToken()) {
        gaveUpRef.current = true
        setState('error')
        setErrorMessage('未登录或登录已过期，请登录后重试。')
        return
      }
      openSocket()
    })
  }, [openSocket, demo])

  useEffect(() => {
    manualCloseRef.current = false
    connect()
    return () => {
      manualCloseRef.current = true
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  // 登录恢复：之前因登录失效放弃重连后，一旦重新拿到 token（用户在全局登录框登录成功），
  // 清掉放弃标记与失败计数，重新建连。demo 通道无鉴权，不参与。
  useEffect(() => {
    if (demo) return
    if (gaveUpRef.current && sessionToken) {
      gaveUpRef.current = false
      authFailRef.current = 0
      reconnectAttemptsRef.current = 0
      setErrorMessage(null)
      connect()
    }
  }, [sessionToken, connect, demo])

  const resetForNewSession = () => {
    setItems([])
    setPending(null)
    setRunning(false)
    setTurnTokens(0)
    setErrorMessage(null)
    setSyncWarning(null)
    setProviderDiag([])
    // 注意：不要在此无条件清 models/slashCommands。Claude 的 supportedModels 在 sidecar 端
    // 是 modelsFetched 缓存的（仅首轮取一次），清了 resume 不会再发 → Claude 模型组永久消失。
    // 改为在 Ready 处理里「仅当引擎为 Codex 时」清空（Codex 无模型/命令清单），见 applyEvent。
    lastSeqRef.current = 0
    sdkSessionIdRef.current = null
    historyBeforeRef.current = null
    historyExhaustedRef.current = false
    setHistoryExhausted(false)
    setCurrentProviderKind('official')
    setCurrentProviderBaseUrl(null)
  }

  const open = useCallback((cwd: string, model?: string, m?: PermissionMode, engine?: Engine, provider?: { apiBaseUrl?: string; authToken?: string }) => {
    resetForNewSession()
    shouldLoadHistoryRef.current = false
    cwdRef.current = cwd
    sessionIdRef.current = null
    setSessionId(null)
    if (m) setModeState(m)
    setCurrentEngine(engine ?? 'claude') // 乐观：新建即按所选引擎，Ready 回来再确认
    // Codex/Gemini 无可查询模型清单：新建即清掉残留的 Claude 模型/命令，避免空窗期误显示
    if (engine === 'codex' || engine === 'gemini') { setModels([]); setSlashCommands([]); setCurrentModel(null) }
    const apiBaseUrl = provider?.apiBaseUrl
    const authToken = provider?.authToken
    setCurrentProviderKind(apiBaseUrl ? 'thirdParty' : 'official')
    setCurrentProviderBaseUrl(apiBaseUrl ?? null)
    intentRef.current = { kind: 'open', cwd, model, mode: m, engine, apiBaseUrl, authToken }
    if (!sendRaw({ type: 'open', cwd, model, mode: m, engine, apiBaseUrl, authToken })) connect()
  }, [sendRaw, connect])

  const switchTo = useCallback((sid: string, hintRunning = false) => {
    resetForNewSession()
    shouldLoadHistoryRef.current = true
    cwdRef.current = '' // 无 cwd，后端按 sdkSessionId 跨目录定位 transcript
    sessionIdRef.current = sid
    setSessionId(sid)
    // 刷新/切回时若已知该会话仍在回答（会话列表 status=RUNNING），乐观置位 running，
    // 让输入区立刻显示「中断」而非「发送」；随后 Ready 的 status 会校正（本轮已结束则回落发送）。
    if (hintRunning) setRunning(true)
    intentRef.current = { kind: 'switch', sessionId: sid }
    if (!sendRaw({ type: 'switchSession', sessionId: sid })) connect()
  }, [sendRaw, connect])

  const resumeHistory = useCallback((sdkSessionId: string, cwd: string) => {
    resetForNewSession()
    shouldLoadHistoryRef.current = true
    cwdRef.current = cwd
    sdkSessionIdRef.current = sdkSessionId
    // 服务端会为该历史会话建一条新元数据行，sessionId 由 ready 事件回填
    sessionIdRef.current = null
    setSessionId(null)
    intentRef.current = { kind: 'resumeHistory', sdkSessionId, cwd }
    if (!sendRaw({ type: 'resumeHistory', sdkSessionId, cwd })) connect()
  }, [sendRaw, connect])

  const resumeCurrent = useCallback(() => {
    const sid = sessionIdRef.current
    if (!sid) return
    setPending(null)
    setRunning(false)
    setErrorMessage(null)
    setItems(prev => {
      const last = prev[prev.length - 1]
      return last?.kind === 'error' ? prev.slice(0, -1) : prev
    })
    if (!sendRaw({ type: 'resumeCurrent', sessionId: sid })) {
      intentRef.current = { kind: 'resumeCurrent', sessionId: sid }
      connect()
    }
  }, [sendRaw, connect])

  const send = useCallback((text: string, attachments?: SendAttachment[]) => {
    const t = text.trim()
    const hasAtt = !!attachments && attachments.length > 0
    if (!t && !hasAtt) return
    // WS 只发 name/path；url/mime 仅留本端气泡显示
    const atts = hasAtt ? attachments!.map(a => ({ name: a.name, path: a.path })) : undefined
    // 全部附件都进气泡显示（图片带 url 缩略图，非图片文件显示文件卡片）
    const disp = hasAtt ? attachments!.map(a => ({ name: a.name, mime: a.mime, url: a.url })) : undefined
    setItems(prev => [...prev, { kind: 'user', id: nextId(), text: t, ts: Date.now(), attachments: disp && disp.length ? disp : undefined }])
    turnStartRef.current = Date.now()
    ttftRef.current = null
    setTurnTokens(0) // 新一轮：清零实时 token 计数
    setRunning(true)
    if (sendRaw({ type: 'send', text: t, attachments: atts })) return
    // WS 未连上：排队并触发重连（带 attach 意图），onopen 时先 attach 再补发，避免消息丢失/卡“思考中”
    pendingSendsRef.current.push({ text: t, attachments: atts })
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.CONNECTING) {
      if (sessionIdRef.current) {
        intentRef.current = { kind: 'attach', sessionId: sessionIdRef.current, lastEventSeq: lastSeqRef.current }
      }
      connect()
    }
  }, [sendRaw, connect])

  const decide = useCallback((msg: Extract<ClientMessage, { type: 'decision' }>) => {
    setPending(null)
    sendRaw(msg)
  }, [sendRaw])

  // ── 待发送队列：running 时入队，本轮结束(running→false 且无待确认弹窗)后按序自动发 ──
  const enqueue = useCallback((text: string, attachments?: SendAttachment[]) => {
    const t = text.trim()
    if (!t && !(attachments && attachments.length > 0)) return
    setQueued(prev => [...prev, { id: nextId(), text: t, attachments }])
  }, [])
  const removeQueued = useCallback((id: string) => {
    setQueued(prev => prev.filter(q => q.id !== id))
  }, [])
  const clearQueued = useCallback(() => setQueued([]), [])

  // 空闲（非 running、无权限/提问弹窗）且队列非空 → 取队首发出
  const sendRef = useRef(send)
  sendRef.current = send
  useEffect(() => {
    if (running || pending || queued.length === 0) return
    const head = queued[0]
    setQueued(prev => prev.slice(1))
    sendRef.current(head.text, head.attachments)
  }, [running, pending, queued])

  const interrupt = useCallback(() => {
    sendRaw({ type: 'interrupt' })
    setRunning(false)
  }, [sendRaw])

  const setMode = useCallback((m: PermissionMode) => {
    setModeState(m) // 乐观更新；下一轮 query 生效
    const sid = sessionIdRef.current
    if (sid) saveMode(sid, m) // 按会话持久化，刷新/重连后由 ready 恢复
    sendRaw({ type: 'setMode', mode: m })
  }, [sendRaw])

  const setModel = useCallback((model: string) => {
    setCurrentModel(model) // 乐观更新；下一轮 query 生效
    sendRaw({ type: 'setModel', model })
  }, [sendRaw])

  // 主动同步模型清单：让 sidecar 重新询问 claude 二进制（Claude Code 自更新后可拿到最新，如新增 Sonnet 5）。
  // 最新清单经 models 事件回来时清「同步中」；兜底 15s 超时自动解除，避免拉取失败时按钮一直转。
  const refreshModels = useCallback(() => {
    setModelsRefreshing(true)
    sendRaw({ type: 'refreshModels' })
    window.setTimeout(() => setModelsRefreshing(false), 15_000)
  }, [sendRaw])

  const setCodexOptions = useCallback((reasoningEffort: CodexReasoningEffort, speed: CodexSpeed) => {
    setCodexReasoningEffort(reasoningEffort)
    setCodexSpeed(speed)
    const sid = sessionIdRef.current
    if (sid) {
      try { localStorage.setItem(codexStorageKey(sid), JSON.stringify({ reasoningEffort, speed })) } catch { /* ignore */ }
    }
    sendRaw({ type: 'setCodexOptions', reasoningEffort, speed })
  }, [sendRaw])

  // 会话内切 agent：同一会话 id 不变，乐观更新引擎；非 claude 清模型列表。上下文由调用方切后另发 seed。
  const switchEngine = useCallback((engine: Engine) => {
    setCurrentEngine(engine)
    if (engine !== 'claude') {
      setModels([])
      setCurrentModel(null)
      setCurrentProviderKind('official')
      setCurrentProviderBaseUrl(null)
    }
    sendRaw({ type: 'switchEngine', engine })
  }, [sendRaw])

  // 会话内切服务商（官方 ↔ 第三方网关，或两网关互切）：同一会话与 sdkSessionId 不变，保留上下文，下一轮生效。
  // 乐观更新 provider 标识与模型列表；权威值随后端重发的 ready/models 校正。空 baseUrl＝切回官方。
  const switchProvider = useCallback((provider?: { apiBaseUrl?: string; authToken?: string }) => {
    const baseUrl = provider?.apiBaseUrl?.trim() || undefined
    const token = baseUrl ? provider?.authToken : undefined
    setCurrentProviderKind(baseUrl ? 'thirdParty' : 'official')
    setCurrentProviderBaseUrl(baseUrl ?? null)
    if (!baseUrl) { setModels([]); setCurrentModel(null) } // 切回官方：清网关模型，待 sidecar supportedModels 重发
    // 关键：同步更新重连意图快照。新建会话的 intent 是带初始 provider 的 'open'，若不更新，一旦重连
    // flushIntent 会重放旧 open（带原 baseUrl）→ 把刚切好的 provider 又覆盖回去（切回官方却被弹回三方的根因）。
    const it = intentRef.current
    if (it && it.kind === 'open') {
      intentRef.current = { ...it, apiBaseUrl: baseUrl, authToken: token }
    }
    sendRaw({ type: 'switchProvider', apiBaseUrl: baseUrl, authToken: token })
  }, [sendRaw])

  // 从某条用户消息分叉出新会话（旧会话保留）。完成后服务端回 forked → 自动 switchTo 新会话。
  const forkSession = useCallback((upToMessageId: string) => {
    sendRaw({ type: 'forkSession', upToMessageId })
  }, [sendRaw])

  const dismissSyncWarning = useCallback(() => setSyncWarning(null), [])

  // 保持 switchToRef 指向最新 switchTo，供 applyEvent('forked') 调用而不进依赖环
  useEffect(() => {
    switchToRef.current = switchTo
  }, [switchTo])

  const loadHistory = useCallback(async (reset: boolean) => {
    const sid = sdkSessionIdRef.current
    if (!sid || historyLoadingRef.current) return
    if (!reset && historyExhaustedRef.current) return
    historyLoadingRef.current = true
    setHistoryLoading(true)
    try {
      const before = reset ? null : historyBeforeRef.current
      const { items: hist, nextBefore } = await loadMessages(sid, cwdRef.current, before)
      // 一律把历史 prepend 到现有项之前，不直接替换：
      // 进会话(switchTo/resumeHistory)会先 resetForNewSession 清空，故此刻 prev 只剩「加载期间本地新增的实时项」
      // ——典型是刚进会话就发出的首条用户气泡（乐观插入）/已开始的流式回复。若 reset 时直接 setItems(hist)，
      // 历史(空会话为 [])加载完成会把这条刚发的消息覆盖掉 → 「新建会话首条消息不显示」。prepend 则两者都保留。
      setItems(prev => [...hist, ...prev])
      historyBeforeRef.current = nextBefore
      const done = nextBefore == null || nextBefore <= 0
      historyExhaustedRef.current = done
      setHistoryExhausted(done)
    } catch {
      // 历史加载失败静默，不阻塞会话
    } finally {
      historyLoadingRef.current = false
      setHistoryLoading(false)
    }
  }, [])

  // 让 applyEvent(ready 回调)能在不进依赖环的情况下触发首屏历史加载
  useEffect(() => {
    loadHistoryRef.current = loadHistory
  }, [loadHistory])

  // ── 自动恢复：sidecar 重启后会话状态丢失时自动 resume，无需用户手动点击 ──────
  // 触发条件：最后一条 item 是 error，code 为 QUERY_FAILED 且 message 含 "No conversation found"。
  // 这说明 sidecar 重启了，会话在其内存中已不存在，但我们的 DB 里仍有记录 + 磁盘上有 transcript。
  // resumeCurrent 会重新 attach 到该 sessionId，让 sidecar 从 transcript 恢复上下文。
  // 最多自动重试 2 次，超过则保留错误条目让用户手动决策（避免无限循环）。
  const autoResumeCountRef = useRef(0)
  useEffect(() => {
    const last = items[items.length - 1]
    if (last?.kind !== 'error') {
      autoResumeCountRef.current = 0 // 非错误状态时重置计数
      return
    }
    if (last.code !== 'QUERY_FAILED' || !last.message?.includes('No conversation found')) return
    if (autoResumeCountRef.current >= 2) return // 超过最大重试次数，留给用户手动处理

    autoResumeCountRef.current += 1
    const attempt = autoResumeCountRef.current
    const timer = setTimeout(() => {
      // 再次确认当前仍是同一条错误（避免状态已变化时误操作）
      resumeCurrent()
      console.info(`[claude-chat] 自动恢复 session（第 ${attempt} 次）`)
    }, 600)
    return () => clearTimeout(timer)
  }, [items, resumeCurrent])
  // ──────────────────────────────────────────────────────────────────────────

  return { state, sessionId, items, pending, running, errorMessage, syncWarning, dismissSyncWarning, mode, slashCommands, skills, agents, mcpServers, outputStyle, models, modelsRefreshing, currentModel, codexReasoningEffort, codexSpeed, currentEngine, currentProviderKind, currentProviderBaseUrl, providerDiag, turnTokens, open, switchTo, resumeHistory, resumeCurrent, send, queued, enqueue, removeQueued, clearQueued, decide, interrupt, setMode, setModel, refreshModels, setCodexOptions, switchEngine, switchProvider, forkSession, historyLoading, historyExhausted, loadHistory }
}
