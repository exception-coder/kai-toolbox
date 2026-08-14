import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { emitSessionExpired, ensureFreshToken, getToken, logout, probeAuth, useAuth } from '@/lib/auth'
import type { Attachment, BackgroundTaskInfo, ChatItem, ClientMessage, CodexReasoningEffort, CodexSpeed, ConnState, Engine, ModelInfo, PendingRequest, PendingSessionRef, PermissionMode, ProviderKind, SendAttachment, ServerMessage, TurnDiag } from '../types'
import { clearQueuedMessages, deleteQueuedMessage, listQueuedMessages, loadMessages, loadPublicReviewMessages, saveQueuedMessage } from '../api'
import { notifyPrompt } from '../browserNotify'
import { pushDebug } from '../lib/debugLog'
import { playNotifySound } from '../sound'
import { normalizePermissionModeForEngine } from '../components/permissionModes'

// 按 sessionId 持久化权限模式，使刷新/放大缩小/重连后该会话仍保持上次选择，而非回退 default。
const VALID_MODES: PermissionMode[] = ['default', 'acceptEdits', 'plan', 'bypassPermissions']
const modeStorageKey = (sid: string) => `kai-toolbox:chat-mode:${sid}`
/**
 * 「弹窗自动允许」：全局偏好（跨会话共用一个键，保持与旧版本一致）。
 * 这里只存「用户的意愿」并在会话 ready 时同步给服务端一次；真正的放行裁决在 sidecar 内同步完成。
 * 以前是前端收到弹窗再自动点「允许」，页面一旦切走/卸载就失效——该开关的语义本就与页面在不在无关。
 */
const AUTO_APPROVE_KEY = 'kai-toolbox:auto-approve-permission'
function loadAutoApprove(): boolean {
  try { return localStorage.getItem(AUTO_APPROVE_KEY) === '1' } catch { return false }
}
const codexStorageKey = (sid: string) => `kai-toolbox:codex-options:${sid}`
interface CodexOptions {
  reasoningEffort: CodexReasoningEffort
  speed: CodexSpeed
}
const DEFAULT_CODEX_OPTIONS: CodexOptions = { reasoningEffort: 'low', speed: 'default' }
function loadCodexOptions(sid: string): CodexOptions {
  try {
    const parsed = JSON.parse(localStorage.getItem(codexStorageKey(sid)) ?? '{}') as Partial<CodexOptions>
    const reasoningEffort = /^[a-z][a-z0-9_-]{0,31}$/.test(parsed.reasoningEffort ?? '')
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

/** 只有正常完成的整轮终态才能释放一条待发送消息；失败和中断必须留给用户处理。 */
function isSuccessfulTurnCompletion(stopReason: string): boolean {
  return ['end_turn', 'success', 'completed', 'stop'].includes(stopReason.trim().toLowerCase())
}

function engineSubagentSummary(payload: Record<string, unknown>): { total: number; running: number } {
  const agents = Array.isArray(payload.agents) ? payload.agents : []
  const running = agents.filter(agent => {
    if (!agent || typeof agent !== 'object') return false
    const state = (agent as Record<string, unknown>).state
    return state === 'pending' || state === 'running'
  }).length
  return { total: agents.length, running }
}

/** 待发送队列项：running 期间排队的用户消息。 */
export interface QueuedMessage {
  id: string
  /** 队列项创建时所属会话；调度时必须与当前会话一致，防止切会话竞态串发。 */
  ownerSessionId: string
  text: string
  createdAt: number
  attachments?: SendAttachment[]
  /** 展示层覆盖，见 send() 同名参数。 */
  displayText?: string
  /** 平台生成、仅供模型使用的本轮约束，不进入用户消息历史。 */
  developerInstructions?: string
}

/** 连接后要发出的首个意图（区分新建 / 续跑 / 重连回放）。 */
type Intent =
  | {
      kind: 'open'
      cwd: string
      model?: string
      mode?: PermissionMode
      engine?: Engine
      apiBaseUrl?: string
      authToken?: string
      codexHome?: string
      codexReasoningEffort?: CodexReasoningEffort
      codexSpeed?: CodexSpeed
      consultEvidenceSystems?: string[]
    }
  | { kind: 'switch'; sessionId: string }
  | { kind: 'duplicate'; sourceSessionId: string; codexHome?: string }
  | { kind: 'resumeHistory'; sdkSessionId: string; cwd: string }
  | { kind: 'resumeCurrent'; sessionId: string }
  | { kind: 'attach'; sessionId: string; lastEventSeq: number }

export interface UseClaudeChatSocket {
  state: ConnState
  sessionId: string | null
  items: ChatItem[]
  pending: PendingRequest | null
  /** 全局跨会话待答快照（含当前会话；UI 通常过滤掉当前会话只提示"其它会话"）。 */
  pendingSessions: PendingSessionRef[]
  running: boolean
  /** 已发出中断请求，正在等待 Sidecar 回执或后端终态校正。 */
  interrupting: boolean
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
  /** 正在向 sidecar 重新请求当前会话能力快照。 */
  capabilitiesRefreshing: boolean
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
  /** 该会话当前存活的后台任务（Agent 工具后台化的子任务）。running=false 时非空，说明可见回合已
   *  结束但后台还有工作没完事——区分"真的没事干了"和"后台还在查、还没回来"。 */
  backgroundTasks: BackgroundTaskInfo[]
  /** 新建会话（可带初始权限模式、引擎、第三方网关 provider；provider 仅 Claude 引擎生效） */
  open: (
    cwd: string,
    model?: string,
    mode?: PermissionMode,
    engine?: Engine,
    provider?: {
      apiBaseUrl?: string
      authToken?: string
      codexHome?: string
      codexReasoningEffort?: CodexReasoningEffort
      codexSpeed?: CodexSpeed
      consultEvidenceSystems?: string[]
    },
  ) => void
  /** 切换权限模式（下一轮生效） */
  setMode: (mode: PermissionMode) => void
  autoApprove: boolean
  setAutoApprove: (on: boolean) => void
  /** 切换模型（下一轮生效） */
  setModel: (model: string) => void
  /** 主动同步模型清单：让 sidecar 重新询问 claude 二进制拉最新型号（Claude Code 自更新后用） */
  refreshModels: () => void
  /** 主动刷新技能、子代理与 MCP 能力清单。 */
  refreshCapabilities: () => void
  setCodexOptions: (reasoningEffort: CodexReasoningEffort, speed: CodexSpeed) => void
  /** 会话内切 agent（引擎），同一会话内换 claude/codex/gemini；上下文靠切后另发 seed 带过去 */
  switchEngine: (engine: Engine) => void
  /** 会话内切服务商（官方 ↔ 第三方网关），同一会话与 sdkSessionId 不变，保留上下文；空入参＝切回官方 */
  switchProvider: (provider?: { apiBaseUrl?: string; authToken?: string }) => void
  /** 从某条用户消息分叉出新会话（旧会话保留），完成后自动切到新会话 */
  forkSession: (upToMessageId: string) => void
  /** 清理异常并继续：分叉到出错前最后一条正常用户消息，丢掉中毒回合，切到新会话并自动补发续上 */
  cleanRetry: () => void
  /** 切到工具内会话（resume 续跑） */
  switchTo: (sessionId: string, hintRunning?: boolean) => void
  duplicateSession: (sourceSessionId: string, codexHome?: string) => void
  duplicatingSessionId: string | null
  /** 续跑磁盘上的历史会话 */
  resumeHistory: (sdkSessionId: string, cwd: string) => void
  resumeCurrent: () => void
  /**
   * 下发一条用户消息（可带附件）。displayText：可选的展示层覆盖——text 仍是实际发给 agent 的完整内容
   * text 是会持久化的真实用户消息；displayText 仅用于普通展示别名。
   * 平台调度协议必须走 developerInstructions，不能再借 displayText 隐藏后混入用户历史。
   */
  send: (text: string, attachments?: SendAttachment[], displayText?: string, developerInstructions?: string) => void
  /** 待发送队列：running 时入队的消息，本轮结束后按序自动发出 */
  queued: QueuedMessage[]
  /** 上一轮未正常完成时的暂停原因；队列保留但不会自动发出。 */
  queuePausedReason: string | null
  /** 入队一条待发送消息（running 时排队；空闲时也可入队，会立即触发发送）。displayText 同 send()。 */
  enqueue: (text: string, attachments?: SendAttachment[], displayText?: string, developerInstructions?: string) => void
  /** 移除队列中某条 */
  removeQueued: (id: string) => void
  /** 会话确认空闲后，人工发送队首；用于恢复历史遗留的未释放消息。 */
  sendQueuedNow: (id: string) => void
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

export type ClaudeChatChannel = 'admin' | 'consult' | 'prd-dev' | 'review'

export function useClaudeChatSocket(opts?: { demo?: boolean; channel?: ClaudeChatChannel; prdSessionId?: string | null; reviewToken?: string | null }): UseClaudeChatSocket {
  // demo（受约束免登录演示）：连 /api/claude-chat/demo/ws，不带 token、不自动 attach 重连。
  const demo = opts?.demo ?? false
  const channel = opts?.channel ?? 'admin'
  const reviewToken = opts?.reviewToken?.trim() || null
  const publicWithoutLogin = demo || channel === 'review'
  const prdSessionId = opts?.prdSessionId?.trim() || null
  const [state, setState] = useState<ConnState>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [items, setItems] = useState<ChatItem[]>([])
  const [pending, setPending] = useState<PendingRequest | null>(null)
  // 全局跨会话待答（连接级快照，非本会话）：任意界面据此标红点并可一键跳去作答。
  const [pendingSessions, setPendingSessions] = useState<PendingSessionRef[]>([])
  const [running, setRunning] = useState(false)
  const [interrupting, setInterrupting] = useState(false)
  const [queued, setQueued] = useState<QueuedMessage[]>([])
  const [queueReleaseVersion, setQueueReleaseVersion] = useState(0)
  const [queuePausedReason, setQueuePausedReason] = useState<string | null>(null)
  const sessionReadyRef = useRef(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [syncWarning, setSyncWarning] = useState<string | null>(null)
  const [mode, setModeState] = useState<PermissionMode>('default')
  const [autoApprove, setAutoApproveState] = useState<boolean>(loadAutoApprove)
  // 供回调内读取最新值而不把 mode/autoApprove 卷进依赖环
  const modeRef = useRef<PermissionMode>('default')
  const autoApproveRef = useRef<boolean>(autoApprove)
  const [slashCommands, setSlashCommands] = useState<string[]>([])
  const [skills, setSkills] = useState<string[]>([])
  const [agents, setAgents] = useState<string[]>([])
  const [mcpServers, setMcpServers] = useState<{ name: string; status: string }[]>([])
  const [capabilitiesRefreshing, setCapabilitiesRefreshing] = useState(false)
  // 会话上挂着的后台任务（Agent 工具后台化的子任务）：result 事件只代表"这一轮可见回复结束了"，
  // 不代表后台工作也结束——这份状态单独跟踪，用来在切会话/发送区展示"后台还有任务在跑"。
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTaskInfo[]>([])
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
  const duplicateSourceRef = useRef<string | null>(null)
  const duplicateTimeoutRef = useRef<number | null>(null)
  const [duplicatingSessionId, setDuplicatingSessionId] = useState<string | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  /** 当前会话最近一次正常终态授予的一次性出队凭证；普通空闲状态不能创建凭证。 */
  const queueReleaseSessionRef = useRef<string | null>(null)
  const serverQueueDispatchRef = useRef(false)
  const manualQueueDispatchIdRef = useRef<string | null>(null)
  const lastSeqRef = useRef<number>(0)
  // 服务端会话纪元（来自 Ready.epoch）；变化即后端重启/会话重建 → seq 已复位，需重置去重高水位
  const lastEpochRef = useRef<string | null>(null)
  const manualCloseRef = useRef(false)
  // WS 重连退避计数（onopen 清零）+ 建连中守卫（覆盖「await 续期」异步窗口，防并发叠多条 WS）
  const reconnectAttemptsRef = useRef(0)
  const connectingRef = useRef(false)
  // 鉴权失效检测：openedRef=本次 socket 是否曾成功 OPEN；authFailRef=连续「未 OPEN 就被关」次数。
  // 注意 authFailRef 到阈值**只是触发一次探针的信号，不是判据**——握手被后端 403 拒绝和网线拔了，
  // 浏览器给的都是 close code 1006（握手的 HTTP 状态不暴露给 JS），单凭它无法区分，只能去问后端。
  // gaveUpRef=已确认登录失效、停重连（等登录成功后再恢复）；forceRefreshRef=下次连接强制续期一次 token。
  const openedRef = useRef(false)
  const authFailRef = useRef(0)
  const gaveUpRef = useRef(false)
  const forceRefreshRef = useRef(false)
  /** 探针在途标记：多次 close 只跑一个探针，避免断网时并发刷请求。 */
  const probingRef = useRef(false)
  /** 待触发的退避重连定时器：网络恢复时要能提前取消它，避免与立即重连叠成两条退避链。 */
  const reconnectTimerRef = useRef<number | null>(null)
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
        if (duplicateSourceRef.current && msg.sessionId !== duplicateSourceRef.current) {
          duplicateSourceRef.current = null
          if (duplicateTimeoutRef.current != null) {
            window.clearTimeout(duplicateTimeoutRef.current)
            duplicateTimeoutRef.current = null
          }
          setDuplicatingSessionId(null)
          setItems([])
          setPending(null)
          setRunning(false)
          setInterrupting(false)
          setTurnTokens(0)
          setSyncWarning(null)
          setProviderDiag([])
          sdkSessionIdRef.current = null
          historyBeforeRef.current = null
          historyExhaustedRef.current = false
          setHistoryExhausted(false)
          shouldLoadHistoryRef.current = false
        }
        setCapabilitiesRefreshing(false)
        // 队列严格按会话隔离：登录通道随后从服务端恢复；公开通道没有持久队列接口，
        // 重连同一评审会话时需保住本页已排队消息，只剔除不属于 Ready 会话的旧项。
        setQueued(previous => publicWithoutLogin
          ? previous.filter(message => message.ownerSessionId === msg.sessionId)
          : [])
        sessionIdRef.current = msg.sessionId
        sessionReadyRef.current = true
        // 公开评审/演示通道没有登录态，也不会把队列写进服务端持久队列表；即使 Ready
        // 声明了 server 调度，这两类通道仍必须由浏览器在本轮结束后释放本地队列。
        serverQueueDispatchRef.current = !publicWithoutLogin && msg.queueDispatchMode === 'server'
        setSessionId(msg.sessionId)
        if (!publicWithoutLogin && channel !== 'consult') void listQueuedMessages(msg.sessionId)
          .then(messages => {
            if (sessionIdRef.current !== msg.sessionId) return
            setQueued(messages.map(message => ({
              id: message.id,
              ownerSessionId: message.sessionId,
              text: message.text,
              createdAt: message.createdAt,
              attachments: message.attachments,
              displayText: message.displayText,
              developerInstructions: message.developerInstructions,
            })))
          })
          .catch(error => {
            if (sessionIdRef.current === msg.sessionId) {
              setSyncWarning(`待发送队列恢复失败：${error instanceof Error ? error.message : String(error)}`)
            }
          })
        setState('ready')
        setErrorMessage(null) // sidecar 重连恢复后会重发 ready，借此清掉 SIDECAR_DOWN 横幅
        // 恢复该会话上次的权限模式（按 sessionId 持久化），并同步给 sidecar，
        // 使刷新/放大缩小/重连后不回退 default。
        {
          const restricted = channel === 'consult' || channel === 'review'
          const savedMode = restricted ? null : loadSavedMode(msg.sessionId)
          if (restricted) {
            setModeState('plan')
            modeRef.current = 'plan'
          } else {
            const restoredMode = normalizePermissionModeForEngine(msg.engine ?? 'claude', savedMode ?? 'default')
            setModeState(restoredMode)
            modeRef.current = restoredMode
            if (restoredMode !== savedMode) saveMode(msg.sessionId, restoredMode)
            sendRaw({ type: 'setMode', mode: restoredMode })
          }
          // 「弹窗自动允许」同步给服务端一次：服务端此后自己保管并随每次 resume 回灌 sidecar，
          // 用户切走页面/关掉浏览器也不影响放行，不再需要前端盯着弹窗自动点。
          const savedAutoApprove = restricted ? false : loadAutoApprove()
          setAutoApproveState(savedAutoApprove)
          autoApproveRef.current = savedAutoApprove
          if (!restricted) {
            sendRaw({
              type: 'setAutoApprove',
              autoApprove: savedAutoApprove && modeRef.current === 'bypassPermissions',
            })
          }
        }
        {
          const fallback = loadCodexOptions(msg.sessionId)
          const options = {
            reasoningEffort: msg.codexReasoningEffort ?? fallback.reasoningEffort,
            speed: msg.codexSpeed ?? fallback.speed,
          }
          setCodexReasoningEffort(options.reasoningEffort)
          setCodexSpeed(options.speed)
          if (msg.engine === 'codex' && channel !== 'consult' && channel !== 'review') {
            sendRaw({ type: 'setCodexOptions', ...options })
          }
        }
        if (msg.slashCommands) setSlashCommands(msg.slashCommands)
        if (msg.skills) setSkills(msg.skills)
        if (msg.agents) setAgents(msg.agents)
        if (msg.mcpServers) setMcpServers(msg.mcpServers)
        // 后台任务快照：切会话/重连那一刻就能查到当时是否还有后台任务在跑，不用等下一次变化事件。
        setBackgroundTasks(msg.backgroundTasks ?? [])
        setOutputStyle(msg.outputStyle ?? null)
        if (msg.engine) setCurrentEngine(msg.engine)
        setCurrentProviderKind(msg.providerKind ?? 'official')
        setCurrentProviderBaseUrl(msg.providerBaseUrl ?? null)
        // Codex/Gemini 会话无 Claude 模型/slash 清单：进入时清掉上一个 Claude 会话残留的选项，避免误显示。
        // Claude 会话不清（其 supportedModels 在 sidecar 端缓存，清了 resume 不会再下发）。
        if (msg.engine === 'codex' || msg.engine === 'gemini') {
          if (msg.engine === 'gemini') setModels([])
          setSlashCommands([])
          // 新后端由 ready 返回会话持久化模型；旧后端没有该字段时保留当前值，
          // 等随后 models 事件校正，避免每轮 ready 再次清成“默认”。
          if (msg.selectedModel !== undefined) setCurrentModel(msg.selectedModel)
          setSkills([])
          setAgents([])
          if (msg.engine === 'gemini') setMcpServers([])
        }
        // RUNNING 必须同时携带服务端当前活动轮次，避免迟到的状态快照把已结束会话重新点亮。
        if (msg.status === 'RUNNING' && msg.activeTurnId) {
          setRunning(true)
        } else if (msg.status && msg.status !== 'RUNNING') {
          setRunning(false)
          setInterrupting(false)
        }
        if (msg.sdkSessionId) sdkSessionIdRef.current = msg.sdkSessionId
        // 仅 switch / resume 进会话时拉一次历史；新建会话(open，sdkSessionId 为空)不拉
        if (shouldLoadHistoryRef.current && msg.sdkSessionId) {
          shouldLoadHistoryRef.current = false
          loadHistoryRef.current(true)
        }
        // 自动恢复后重发未处理的用户消息：
        // expectingReadyRef 由 auto-resume 效果置位，表示"下一个 ready 是恢复成功信号"。
        // hasAutoResentRef 置位后，若重发的消息也失败（再次触发 QUERY_FAILED），立即中止，不再循环。
        if (expectingReadyRef.current) {
          expectingReadyRef.current = false
          const pending = pendingResendRef.current
          if (pending && pending.forSessionId === msg.sessionId) {
            pendingResendRef.current = null
            setTimeout(() => { sendRef.current?.(pending.text) }, 300)
          }
        }
        break
      case 'assistantDelta':
        // 实打实收到流式内容 = 该会话确凿无疑正在跑，不管此刻 running 之前是什么值都直接点亮——
        // 比 switchTo 的 hintRunning 更可靠：hint 是切会话那一刻的乐观猜测（可能因缓存过期猜错），
        // 这里是"正在发生的事实"，用来自愈任何猜错的场景（包括从没猜过、hint 传了 false 的老路径）。
        setRunning(true)
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
        setRunning(true) // 同上：工具调用同样是“正在跑”的确凿证据
        setItems(prev => {
          const toolCallId = msg.toolCallId || undefined
          const id = toolCallId ? `tool-${toolCallId}` : nextId()
          const index = toolCallId ? prev.findIndex(item => item.kind === 'tool' && item.toolCallId === toolCallId) : -1
          const next = { kind: 'tool' as const, id, toolCallId, toolName: msg.toolName, input: msg.input, ts: Date.now() }
          if (index < 0) return [...prev, next]
          const copy = prev.slice()
          copy[index] = { ...prev[index], ...next }
          return copy
        })
        break
      case 'toolResult':
        setItems(prev => {
          // 新协议按稳定调用 ID 精确回填；旧 sidecar 没有 ID 时再按名称向后兼容。
          for (let i = prev.length - 1; i >= 0; i--) {
            const it = prev[i]
            const matched = it.kind === 'tool' && it.output === undefined && (msg.toolCallId
              ? it.toolCallId === msg.toolCallId
              : it.toolName === msg.toolName)
            if (matched) {
              const copy = prev.slice()
              copy[i] = { ...it, output: msg.output, isError: msg.isError,
                elapsedMs: it.ts == null ? undefined : Math.max(0, Date.now() - it.ts) }
              return copy
            }
          }
          const toolCallId = msg.toolCallId || undefined
          return [...prev, { kind: 'tool', id: toolCallId ? `tool-${toolCallId}` : nextId(), toolCallId,
            toolName: msg.toolName, input: null, output: msg.output, isError: msg.isError, ts: Date.now() }]
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
        if (channel === 'review') {
          const defaultModel = msg.models.find(model => model.isDefault)
          if (defaultModel?.defaultReasoningEffort) setCodexReasoningEffort(defaultModel.defaultReasoningEffort)
          setCodexSpeed('default')
        }
        setModelsRefreshing(false) // 收到最新清单：结束「同步中」态
        break
      case 'userMessage':
        // 把本轮用户消息的 SDK transcript uuid 挂到最近一条 user 项上，供异常清理回退
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
      case 'forkAnchor':
        // 挂到本轮最后一条回答：Claude 是 message UUID，Codex 是 turn ID。
        setItems(prev => {
          for (let i = prev.length - 1; i >= 0; i--) {
            const it = prev[i]
            if (it.kind === 'assistant' && !it.forkAnchor) {
              const copy = prev.slice()
              copy[i] = { ...it, forkAnchor: msg.anchor }
              return copy
            }
          }
          return prev
        })
        break
      case 'forked':
        // 分叉完成：切到新会话续跑（旧会话保留）
        switchToRef.current(msg.sessionId)
        // 「清理异常并继续」：分叉后待新会话 ready 时自动补发出错前的用户文本（复用 pendingResend 机制）。
        // 在 switchTo 之后设置——switchTo 内的 resetForNewSession 只重置 state，不动这些 ref。
        if (forkResendRef.current != null) {
          if (forkResendRef.current.trim()) {
            pendingResendRef.current = { forSessionId: msg.sessionId, text: forkResendRef.current }
            expectingReadyRef.current = true
          }
          forkResendRef.current = null
        }
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
          transport: msg.transport,
        }, ...prev].slice(0, 30))
        break
      case 'turnProgress':
        setTurnTokens(msg.outputTokens)
        break
      case 'warning':
        setItems(prev => [...prev, { kind: 'warning', id: nextId(), code: msg.code, message: msg.message, ts: Date.now() }])
        break
      case 'toolActivity': {
        if (isRunningActivity(msg.status)) setRunning(true)
        const id = `tool-activity-${msg.toolCallId || msg.seq}`
        setItems(prev => {
          let base = prev
          if (msg.outcome === 'success') {
            const retryIndex = findRecoverableCommandFailure(prev, msg.toolName)
            if (retryIndex >= 0) {
              base = prev.slice()
              const failed = base[retryIndex]
              if (failed.kind === 'activity') {
                base[retryIndex] = {
                  ...failed,
                  title: `已自动重试 · ${failed.title}`,
                  outcome: 'recovered',
                  severity: 'info',
                }
              }
            }
          }
          const index = base.findIndex(item => item.id === id)
          const previous = index >= 0 ? base[index] : undefined
          const next = {
            kind: 'activity' as const,
            id,
            activityType: 'tool',
            status: msg.status,
            title: msg.title,
            detail: msg.detail,
            outcome: msg.outcome,
            severity: msg.severity,
            data: { elapsedMs: msg.elapsedMs, output: msg.outputTail, toolName: msg.toolName },
            ts: previous?.ts ?? Date.now(),
          }
          if (index < 0) return [...base, next]
          const copy = base.slice()
          copy[index] = next
          return copy
        })
        break
      }
      case 'turnActivity': {
        if (isRunningActivity(msg.status)) setRunning(true)
        setItems(prev => {
          const id = 'turn-activity-current'
          const next = {
            kind: 'activity' as const,
            id,
            activityType: 'turn',
            status: msg.status,
            title: msg.title,
            detail: msg.detail,
            data: { elapsedMs: msg.elapsedMs, phase: msg.phase },
            ts: Date.now(),
          }
          const index = prev.findIndex(item => item.id === id)
          if (index < 0) return [...prev, next]
          const copy = prev.slice()
          copy[index] = next
          return copy
        })
        break
      }
      case 'codexActivity': {
        setRunning(true)
        const id = `codex-activity-${msg.activityType}-${msg.itemId || msg.seq}`
        setItems(prev => {
          const next = { kind: 'activity' as const, id, activityType: msg.activityType, status: msg.status,
            title: msg.title, detail: msg.detail, data: msg.data, ts: Date.now() }
          const index = prev.findIndex(item => item.id === id)
          if (index < 0) return [...prev, next]
          const copy = prev.slice()
          copy[index] = next
          return copy
        })
        break
      }
      case 'engineEvent': {
        // assistant/tool 事件仍由兼容事件渲染，避免迁移期重复展示；这里消费新增的统一状态语义。
        if (msg.eventType === 'subagents.snapshot') {
          const summary = engineSubagentSummary(msg.payload)
          if (summary.running > 0) setRunning(true)
          setItems(prev => {
            const id = `engine-subagents-${msg.turnId}`
            const next = {
              kind: 'activity' as const,
              id,
              activityType: 'subagent',
              status: summary.running > 0 ? 'inProgress' : 'completed',
              title: summary.running > 0
                ? `${msg.engine} 子 Agent 作业中 · ${summary.running}/${summary.total}`
                : `${msg.engine} 子 Agent 已收口 · ${summary.total}`,
              data: msg.payload,
              ts: msg.observedAt,
            }
            const index = prev.findIndex(item => item.id === id)
            if (index < 0) return [...prev, next]
            const copy = prev.slice()
            copy[index] = next
            return copy
          })
        } else if (msg.eventType === 'engine.connection') {
          const transport = typeof msg.payload.transport === 'string' ? msg.payload.transport : 'unknown'
          setItems(prev => [...prev, {
            kind: 'activity', id: `engine-connection-${msg.eventId}`, activityType: 'connection',
            status: transport === 'connected' ? 'completed' : 'inProgress',
            title: transport === 'connected' ? `${msg.engine} 已连接` : `${msg.engine} ${transport}`,
            data: msg.payload, ts: msg.observedAt,
          }])
        }
        break
      }
      case 'result': {
        setRunning(false)
        setInterrupting(false)
        setPending(null)
        const completedSuccessfully = isSuccessfulTurnCompletion(msg.stopReason)
        queueReleaseSessionRef.current = !serverQueueDispatchRef.current && completedSuccessfully
          ? sessionIdRef.current : null
        setQueuePausedReason(completedSuccessfully
          ? null : '上一轮未正常完成，待发送消息已暂停；请确认后手动继续。')
        setQueueReleaseVersion(version => version + 1)
        const latencyMs = turnStartRef.current != null ? Date.now() - turnStartRef.current : undefined
        const ttftMs = ttftRef.current ?? undefined
        const usage = normalizeUsage(msg.usage)
        turnStartRef.current = null
        ttftRef.current = null
        setItems(prev => [...prev, { kind: 'result', id: nextId(), stopReason: msg.stopReason, traceId: msg.traceId, ts: Date.now(), usage, latencyMs, ttftMs }])
        // Claude 回复完成:仅当页面不在前台时响一声,避免你正盯着看时反复叮咚
        if (typeof document !== 'undefined' && document.hidden) playNotifySound()
        break
      }
      case 'queueDispatched': {
        queueReleaseSessionRef.current = null
        setQueuePausedReason(null)
        setQueued(prev => prev.filter(message => message.id !== msg.messageId))
        const attachments = msg.attachments?.map(attachment => ({
          name: attachment.name,
          mime: attachment.mime ?? undefined,
          url: attachment.mime?.startsWith('image/')
            ? `/api/claude-chat/attachments/file?path=${encodeURIComponent(attachment.path)}`
            : undefined,
        }))
        setItems(prev => {
          const id = `queued-user-${msg.messageId}`
          if (prev.some(item => item.id === id)) return prev
          const displayText = msg.displayText?.trim()
          return [...prev, { kind: 'user', id, text: msg.text,
            displayText: displayText && displayText !== msg.text ? displayText : undefined,
            ts: msg.createdAt, attachments: attachments?.length ? attachments : undefined }]
        })
        turnStartRef.current = Date.now()
        ttftRef.current = null
        setTurnTokens(0)
        setRunning(true)
        setInterrupting(false)
        break
      }
      case 'interruptState':
        setInterrupting(msg.active && (msg.outcome === 'requested'
          || msg.outcome === 'accepted' || msg.outcome === 'correcting'))
        break
      case 'error':
        if (msg.terminal !== false) {
          setRunning(false)
          setInterrupting(false)
          queueReleaseSessionRef.current = null
          setQueuePausedReason('上一轮发生终态错误，待发送消息已暂停；请确认后手动继续。')
        }
        if (duplicateSourceRef.current) {
          duplicateSourceRef.current = null
          if (duplicateTimeoutRef.current != null) {
            window.clearTimeout(duplicateTimeoutRef.current)
            duplicateTimeoutRef.current = null
          }
          setDuplicatingSessionId(null)
          intentRef.current = sessionIdRef.current
            ? { kind: 'attach', sessionId: sessionIdRef.current, lastEventSeq: lastSeqRef.current }
            : null
          setErrorMessage(`复制会话失败：${msg.message}`)
        }
        if (msg.code === 'CAPABILITIES_UNAVAILABLE') setCapabilitiesRefreshing(false)
        // 同一条错误连续重复时不再追加：像前后端版本不一致导致的 BAD_MESSAGE，会随每次
        // 开关切换/重连反复触发，逐条堆进消息流会把真正的对话内容顶没。保留第一条即可。
        setItems(prev => {
          const last = prev[prev.length - 1]
          if (last && last.kind === 'error' && last.code === msg.code && last.message === msg.message) {
            return prev
          }
          return [...prev, { kind: 'error', id: nextId(), code: msg.code, message: msg.message, ts: Date.now() }]
        })
        if (msg.code === 'SIDECAR_DOWN') {
          setErrorMessage(msg.message)
        }
        break
      case 'backgroundTasks':
        // 全量快照，REPLACE 语义：直接覆盖，不用配对开始/结束事件。
        setBackgroundTasks(msg.tasks)
        break
      case 'pendingSessions':
        // 全局跨会话待答快照（REPLACE 语义）：连接级 seq=0，始终覆盖。
        setPendingSessions(msg.sessions)
        break
    }
  }, [])

  const flushIntent = useCallback(() => {
    const intent = intentRef.current
    if (!intent) return
    if (intent.kind === 'open') sendRaw({
      type: 'open',
      cwd: intent.cwd,
      model: intent.model,
      mode: intent.mode,
      engine: intent.engine,
      apiBaseUrl: intent.apiBaseUrl,
      authToken: intent.authToken,
      codexHome: intent.codexHome,
      codexReasoningEffort: intent.codexReasoningEffort,
      codexSpeed: intent.codexSpeed,
      consultEvidenceSystems: intent.consultEvidenceSystems,
    })
    else if (intent.kind === 'switch') sendRaw({ type: 'switchSession', sessionId: intent.sessionId })
    else if (intent.kind === 'duplicate') sendRaw({
      type: 'duplicateSession',
      sourceSessionId: intent.sourceSessionId,
      codexHome: intent.codexHome,
    })
    else if (intent.kind === 'resumeHistory') sendRaw({ type: 'resumeHistory', sdkSessionId: intent.sdkSessionId, cwd: intent.cwd })
    else if (intent.kind === 'resumeCurrent') sendRaw({ type: 'resumeCurrent', sessionId: intent.sessionId })
    else sendRaw({ type: 'attach', sessionId: intent.sessionId, lastEventSeq: intent.lastEventSeq })
  }, [sendRaw])

  // 断线期间发出的用户消息排这里，重连 attach 后自动补发，避免静默丢失 + “思考中”卡死
  const pendingSendsRef = useRef<{
    text: string
    attachments?: Attachment[]
    developerInstructions?: string
  }[]>([])

  const flushPendingSends = useCallback(() => {
    if (pendingSendsRef.current.length === 0) return
    const queue = pendingSendsRef.current
    pendingSendsRef.current = [] // 先清空再发，防多连接竞态下重复补发
    for (const m of queue) {
      sendRaw({
        type: 'send',
        text: m.text,
        attachments: m.attachments,
        developerInstructions: m.developerInstructions,
      })
    }
  }, [sendRaw])

  /**
   * 反复握手前即断时，问后端一次「凭证还认不认」，据实处置：
   * - expired：确实失效 → 停重连、清 token、弹登录框（这才是唯一该打扰用户的场景）
   * - unreachable：断网 / 后端没起 → 什么都不做，保留 token，继续按退避重连，网络回来自然接上
   * - valid：凭证没问题，握手失败另有原因（后端重启中等）→ 同样继续重连
   *
   * 计数器清零是关键：不清的话下一次 close 又会立刻满足阈值，断网期间会反复打探针。
   */
  const confirmAuthOrKeepRetrying = useCallback(() => {
    if (probingRef.current) return
    probingRef.current = true
    authFailRef.current = 0
    void probeAuth().then(result => {
      probingRef.current = false
      if (result !== 'expired') {
        pushDebug('conn', 'auth-probe', `握手反复失败，但凭证探针返回 ${result}：判为网络问题，保留登录态继续重连`)
        return
      }
      gaveUpRef.current = true
      setState('error')
      setErrorMessage('登录已过期或凭证失效，请重新登录后重试。')
      logout()             // 后端已明确拒绝，此时清 token 才是对的
      emitSessionExpired() // 通知全局守卫弹登录框
    })
  }, [])

  // 用新鲜 token 真正建 WS（已确保 token 续期、并发守卫已置位）。
  const openSocket = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    // WS 握手无法带 Authorization 头，通过 access_token 查询参数鉴权：
    // Vibe Coding 走 admin 通道校验 ADMIN；业务咨询走 consult 通道，只要求有效登录用户。
    // demo 通道公开免鉴权（路由不挂拦截器），不带 token。
    const token = publicWithoutLogin ? null : getToken()
    const query = new URLSearchParams()
    if (token) query.set('access_token', token)
    if (channel === 'prd-dev' && prdSessionId) query.set('prd_session_id', prdSessionId)
    if (channel === 'review' && reviewToken) query.set('review_token', reviewToken)
    const qs = query.size ? `?${query.toString()}` : ''
    const path = demo
      ? '/api/claude-chat/demo/ws'
      : channel === 'review'
        ? '/api/claude-chat/review/ws'
        : channel === 'consult'
        ? '/api/claude-chat/consult/ws'
        : channel === 'prd-dev'
          ? '/api/claude-chat/prd-dev/ws'
          : '/api/claude-chat/ws'
    const url = `${proto}//${window.location.host}${path}${qs}`
    setState('connecting')
    openedRef.current = false // 新一次尝试：先假定未连上，onopen 置真
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (wsRef.current !== ws) return
      reconnectAttemptsRef.current = 0 // 连上即清零退避，下次断线从最短间隔重来
      openedRef.current = true
      authFailRef.current = 0 // 成功握手即清鉴权失败计数
      pushDebug('conn', 'open', `WS 已连接 ${path}`)
      flushIntent()
      flushPendingSends()
    }
    ws.onmessage = ev => {
      if (wsRef.current !== ws) return
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
      if (wsRef.current !== ws) return
      setState('error')
      setErrorMessage('WebSocket 连接出错')
      pushDebug('conn', 'error', 'WebSocket 连接出错')
    }
    ws.onclose = () => {
      // 切换 ADMIN / PRD 开发通道时，旧 socket 的 close 可能晚于新 socket 建立；
      // 旧回调不能清掉新连接或按旧会话再次发起重连。
      if (wsRef.current !== ws) return
      wsRef.current = null
      pushDebug('conn', 'close', `WS 关闭（openedThisAttempt=${openedRef.current}）`)
      if (manualCloseRef.current) return
      const openedThisAttempt = openedRef.current
      // 「握手前就被关」+ 本地有 token：只当作「可能是鉴权被拒」的线索去核实，不当判据。
      // 曾经的假设是「同源下网络抖动通常能完成握手，反复未 OPEN 即关几乎只可能是鉴权被拒」——
      // 断网场景下这不成立：手机切网/断流时每次都连不上，攒够 3 次就把有效 token 清了、弹登录框。
      // 浏览器已知处于离线状态：连不上是必然的，与凭证无关，不计入鉴权失败。
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      if (!publicWithoutLogin && !offline && !openedThisAttempt && getToken()) {
        const f = (authFailRef.current += 1)
        if (f >= 3) {
          // 到阈值只说明「反复握手前就断」，**不足以判定登录失效**：握手被 403 拒和网线拔了，
          // onclose 拿到的都是 code 1006，浏览器不暴露握手的 HTTP 状态。所以这里不再直接 logout，
          // 而是发一个带鉴权的探针请求让后端裁决，拿到真 401/403 才停重连并弹登录框。
          confirmAuthOrKeepRetrying()
        } else {
          forceRefreshRef.current = true // 下次连接前强制续期一次（治后端重启/时钟偏移导致的旧 token 被拒）
        }
      }
      // 非主动关闭且已有会话：自动重连并 attach 回放（断连不丢消息），按指数退避避免死循环刷屏
      // demo 会话随 WS 断开即被服务端销毁，重连 attach 已无意义；只置 closed。
      if (!demo && sessionIdRef.current) {
        intentRef.current = { kind: 'attach', sessionId: sessionIdRef.current, lastEventSeq: lastSeqRef.current }
        setState('closed')
        const n = (reconnectAttemptsRef.current += 1)
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(n, 5)) + Math.floor(Math.random() * 500)
        if (reconnectTimerRef.current != null) window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null
          connect()
        }, delay)
      } else {
        setState('closed')
      }
    }
  }, [applyEvent, flushIntent, flushPendingSends, demo, channel, prdSessionId, reviewToken, publicWithoutLogin, confirmAuthOrKeepRetrying])

  const connect = useCallback(() => {
    // 幂等：已有在连/已连的 socket，或正处于「续期+建连」异步窗口时，不再叠一条。
    // 否则 mount 的 connect() 与 auto-open 的 switchTo()→connect() 会并发各建一条 WS，
    // 两条都被加为服务端 viewer 且共用同一 hook，每条事件被 applyEvent 投递两次 → 消息/结束标记翻倍。
    const existing = wsRef.current
    if (existing && (existing.readyState === WebSocket.CONNECTING || existing.readyState === WebSocket.OPEN)) {
      return
    }
    if (connectingRef.current) return
    // 登录失效只影响需要登录的通道；demo / 公开评审使用各自 capability，不能被本机登录态拦住。
    if (!publicWithoutLogin && gaveUpRef.current) { setState('error'); return }
    connectingRef.current = true
    setState('connecting')
    // demo 与公开评审都免登录：前者由沙箱约束，后者由 review_token capability 约束。
    // 这里必须跳过 access token 续期，否则从未登录过的新浏览器打不开本应公开的评审链接。
    if (publicWithoutLogin) {
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
  }, [openSocket, publicWithoutLogin])

  // 通道切换必须在页面的普通 effect（例如“开始开发”handoff）之前完成清理。
  // 否则 handoff 会把 open/send 发给上一条仍处于 OPEN 的 ADMIN socket，形成已创建但未绑定 PRD 的孤儿会话。
  useLayoutEffect(() => {
    manualCloseRef.current = false
    connect()
    return () => {
      manualCloseRef.current = true
      if (reconnectTimerRef.current != null) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  /**
   * 网络恢复即刻重连，不等退避到点。
   *
   * 退避上限 30s，断网久了恢复后最坏要干等半分钟——而 online 事件本身就是「可以连了」的确定信号，
   * 没有理由不用。同时清零退避计数（这一轮失败是断网造成的，不该让下一次重连继承长延迟）
   * 与鉴权失败计数（那几次 close 全是网络原因，不能算在凭证头上）。
   */
  useEffect(() => {
    if (publicWithoutLogin) return
    const onOnline = () => {
      if (manualCloseRef.current || gaveUpRef.current) return // 已卸载 / 已确认登录失效，不掺和
      if (reconnectTimerRef.current != null) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      reconnectAttemptsRef.current = 0
      authFailRef.current = 0
      pushDebug('conn', 'online', '网络恢复，立即重连（跳过退避等待）')
      connect() // 自身幂等：已有 CONNECTING/OPEN 的 socket 时直接返回
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [connect, publicWithoutLogin])

  // 登录恢复：之前因登录失效放弃重连后，一旦重新拿到 token（用户在全局登录框登录成功），
  // 清掉放弃标记与失败计数，重新建连。demo 通道无鉴权，不参与。
  useEffect(() => {
    if (publicWithoutLogin) return
    if (gaveUpRef.current && sessionToken) {
      gaveUpRef.current = false
      authFailRef.current = 0
      reconnectAttemptsRef.current = 0
      setErrorMessage(null)
      connect()
    }
  }, [sessionToken, connect, publicWithoutLogin])

  const resetForNewSession = () => {
    sessionReadyRef.current = false
    duplicateSourceRef.current = null
    if (duplicateTimeoutRef.current != null) {
      window.clearTimeout(duplicateTimeoutRef.current)
      duplicateTimeoutRef.current = null
    }
    setDuplicatingSessionId(null)
    setItems([])
    setPending(null)
    setQueued([])
    queueReleaseSessionRef.current = null
    serverQueueDispatchRef.current = false
    setQueuePausedReason(null)
    setRunning(false)
    setInterrupting(false)
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

  const open = useCallback((cwd: string, model?: string, m?: PermissionMode, engine?: Engine, provider?: {
    apiBaseUrl?: string
    authToken?: string
    codexHome?: string
    codexReasoningEffort?: CodexReasoningEffort
    codexSpeed?: CodexSpeed
    consultEvidenceSystems?: string[]
  }) => {
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
    const codexHome = provider?.codexHome
    const codexReasoningEffort = provider?.codexReasoningEffort
    const codexSpeed = provider?.codexSpeed
    const consultEvidenceSystems = provider?.consultEvidenceSystems
    intentRef.current = {
      kind: 'open',
      cwd,
      model,
      mode: m,
      engine,
      apiBaseUrl,
      authToken,
      codexHome,
      codexReasoningEffort,
      codexSpeed,
      consultEvidenceSystems,
    }
    if (!sendRaw({
      type: 'open',
      cwd,
      model,
      mode: m,
      engine,
      apiBaseUrl,
      authToken,
      codexHome,
      codexReasoningEffort,
      codexSpeed,
      consultEvidenceSystems,
    })) connect()
  }, [sendRaw, connect])

  const switchTo = useCallback((sid: string, hintRunning = false) => {
    resetForNewSession()
    if (channel === 'consult') setState('connecting')
    shouldLoadHistoryRef.current = true
    cwdRef.current = '' // 无 cwd，后端按 sdkSessionId 跨目录定位 transcript
    sessionIdRef.current = sid
    setSessionId(sid)
    // 刷新/切回时若已知该会话仍在回答（会话列表 status=RUNNING），乐观置位 running，
    // 让输入区立刻显示「中断」而非「发送」；随后 Ready 的 status 会校正（本轮已结束则回落发送）。
    if (hintRunning) setRunning(true)
    intentRef.current = { kind: 'switch', sessionId: sid }
    if (!sendRaw({ type: 'switchSession', sessionId: sid })) connect()
  }, [channel, sendRaw, connect])

  const duplicateSession = useCallback((sourceSessionId: string, codexHome?: string) => {
    if (duplicateSourceRef.current) return
    duplicateSourceRef.current = sourceSessionId
    setDuplicatingSessionId(sourceSessionId)
    setErrorMessage(null)
    intentRef.current = { kind: 'duplicate', sourceSessionId, codexHome }
    if (!sendRaw({ type: 'duplicateSession', sourceSessionId, codexHome })) connect()
    duplicateTimeoutRef.current = window.setTimeout(() => {
      if (duplicateSourceRef.current !== sourceSessionId) return
      duplicateSourceRef.current = null
      duplicateTimeoutRef.current = null
      setDuplicatingSessionId(null)
      intentRef.current = sessionIdRef.current
        ? { kind: 'attach', sessionId: sessionIdRef.current, lastEventSeq: lastSeqRef.current }
        : null
      setErrorMessage('复制会话超时：后端可能未启动或尚未加载最新版本，请重启后端后重试')
    }, 15_000)
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

  const send = useCallback((text: string, attachments?: SendAttachment[], displayText?: string,
                            developerInstructions?: string) => {
    const t = text.trim()
    const hasAtt = !!attachments && attachments.length > 0
    if (!t && !hasAtt) return
    // 任意新轮一旦开始就撤销旧轮凭证；下一条队列消息必须等待本轮自己的成功终态。
    queueReleaseSessionRef.current = null
    setQueuePausedReason(null)
    // WS 只发 name/path；url/mime 仅留本端气泡显示
    const atts = hasAtt ? attachments!.map(a => ({ name: a.name, path: a.path })) : undefined
    // 全部附件都进气泡显示（图片带 url 缩略图，非图片文件显示文件卡片）
    const disp = hasAtt ? attachments!.map(a => ({ name: a.name, mime: a.mime, url: a.url })) : undefined
    // displayText 只影响本地这条气泡的展示；真正发给 agent 的仍是完整的 t（下面 sendRaw 不变）
    const dt = displayText?.trim()
    setItems(prev => [...prev, { kind: 'user', id: nextId(), text: t, displayText: dt && dt !== t ? dt : undefined, ts: Date.now(), attachments: disp && disp.length ? disp : undefined }])
    turnStartRef.current = Date.now()
    ttftRef.current = null
    setTurnTokens(0) // 新一轮：清零实时 token 计数
    setRunning(true)
    setInterrupting(false)
    const hiddenInstructions = developerInstructions?.trim() || undefined
    if (sendRaw({ type: 'send', text: t, attachments: atts, developerInstructions: hiddenInstructions })) return
    // WS 未连上：排队并触发重连（带 attach 意图），onopen 时先 attach 再补发，避免消息丢失/卡“思考中”
    pendingSendsRef.current.push({ text: t, attachments: atts, developerInstructions: hiddenInstructions })
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.CONNECTING) {
      if (sessionIdRef.current) {
        intentRef.current = { kind: 'attach', sessionId: sessionIdRef.current, lastEventSeq: lastSeqRef.current }
      }
      connect()
    }
  }, [sendRaw, connect])

  /**
   * 回灌权限/提问决策。发送失败时**不清 pending**——原先是先乐观 setPending(null) 再发，
   * WS 恰好断开的那一瞬点「允许」，弹窗关了、消息压根没发出去，用户以为已批准，实则一路等到
   * 5 分钟超时 deny。保留弹窗才能让用户看到并重试（重连后后端也会 redeliverPending 补投）。
   */
  const decide = useCallback((msg: Extract<ClientMessage, { type: 'decision' }>) => {
    if (!sendRaw(msg)) return
    setPending(null)
  }, [sendRaw])

  // ── 待发送队列：running 时入队，本轮结束(running→false 且无待确认弹窗)后按序自动发 ──
  const enqueue = useCallback((text: string, attachments?: SendAttachment[], displayText?: string,
                               developerInstructions?: string) => {
    if (channel === 'consult') {
      setSyncWarning('业务咨询不支持排队发送，请等待当前回答完成后再追问')
      return
    }
    const t = text.trim()
    if (!t && !(attachments && attachments.length > 0)) return
    const sessionId = sessionIdRef.current
    if (!sessionId) return
    const message = { id: nextId(), ownerSessionId: sessionId, text: t, attachments, displayText, developerInstructions, createdAt: Date.now() }
    if (publicWithoutLogin) {
      setQueued(prev => [...prev, message])
      return
    }
    // 先落盘再进入可调度内存队列，避免当前轮恰好结束时 DELETE 抢在 POST 前面导致幽灵队列项。
    void saveQueuedMessage(sessionId, message)
      .then(() => {
        if (sessionIdRef.current === sessionId) setQueued(prev => [...prev, message])
      })
      .catch(error => {
        if (sessionIdRef.current === sessionId) {
          setSyncWarning(`消息加入队列失败：${error instanceof Error ? error.message : String(error)}`)
        }
      })
  }, [channel, publicWithoutLogin])
  const removeQueued = useCallback((id: string) => {
    if (publicWithoutLogin) {
      setQueued(prev => prev.filter(q => q.id !== id))
      return
    }
    const sessionId = sessionIdRef.current
    if (!sessionId) return
    void deleteQueuedMessage(sessionId, id)
      .then(() => {
        if (sessionIdRef.current === sessionId) setQueued(prev => prev.filter(q => q.id !== id))
      })
      .catch(error => setSyncWarning(`删除队列消息失败：${error instanceof Error ? error.message : String(error)}`))
  }, [publicWithoutLogin])
  const clearQueued = useCallback(() => {
    if (publicWithoutLogin) {
      setQueued([])
      return
    }
    const sessionId = sessionIdRef.current
    if (!sessionId) return
    void clearQueuedMessages(sessionId)
      .then(() => {
        if (sessionIdRef.current === sessionId) setQueued([])
      })
      .catch(error => setSyncWarning(`清空待发送队列失败：${error instanceof Error ? error.message : String(error)}`))
  }, [publicWithoutLogin])

  const sendQueuedNow = useCallback((id: string) => {
    if (running || pending || backgroundTasks.length > 0 || manualQueueDispatchIdRef.current) return
    const message = queued[0]
    const sessionId = sessionIdRef.current
    if (!message || message.id !== id || !sessionId || message.ownerSessionId !== sessionId
        || !sessionReadyRef.current) return
    if (publicWithoutLogin) {
      setQueued(prev => prev.filter(item => item.id !== id))
      send(message.text, message.attachments, message.displayText, message.developerInstructions)
      return
    }
    manualQueueDispatchIdRef.current = id
    void deleteQueuedMessage(sessionId, id)
      .then(() => {
        if (sessionIdRef.current !== sessionId || !sessionReadyRef.current) {
          void saveQueuedMessage(message.ownerSessionId, message)
          return
        }
        setQueued(prev => prev.filter(item => item.id !== id))
        send(message.text, message.attachments, message.displayText, message.developerInstructions)
      })
      .catch(error => setSyncWarning(`队列消息发送失败：${error instanceof Error ? error.message : String(error)}`))
      .finally(() => { manualQueueDispatchIdRef.current = null })
  }, [backgroundTasks.length, pending, publicWithoutLogin, queued, running, send])

  // 只有当前会话收到明确的成功终态，且无待确认、无后台作业时，才取队首发出。
  const sendRef = useRef(send)
  const dispatchingQueueIdRef = useRef<string | null>(null)
  sendRef.current = send
  useEffect(() => {
    if (channel === 'consult') return
    if (serverQueueDispatchRef.current) return
    if (!sessionReadyRef.current || running || pending || backgroundTasks.length > 0 || queued.length === 0) return
    const head = queued[0]
    const sessionId = sessionIdRef.current
    // Effect 可能已由旧会话 render 排队、却在 switchTo 更新 ref 后才执行。
    // 队列项归属不匹配时必须原地停止，不能用新会话 ID 删除并发送旧会话消息。
    if (!sessionId || queueReleaseSessionRef.current !== sessionId
        || head.ownerSessionId !== sessionId || dispatchingQueueIdRef.current === head.id) return
    if (publicWithoutLogin) {
      queueReleaseSessionRef.current = null
      setQueued(prev => prev.slice(1))
      sendRef.current(head.text, head.attachments, head.displayText, head.developerInstructions)
      return
    }
    dispatchingQueueIdRef.current = head.id
    // 先确认持久记录删除，再在同一微任务中发送；避免刷新后恢复出已经发送过的消息。
    void deleteQueuedMessage(sessionId, head.id)
      .then(() => {
        if (sessionIdRef.current !== sessionId || !sessionReadyRef.current) {
          // 删除请求发出后才切换会话：把消息恢复到原会话持久队列，避免“不串发但丢消息”。
          void saveQueuedMessage(head.ownerSessionId, head)
          return
        }
        queueReleaseSessionRef.current = null
        setQueued(prev => prev.filter(item => item.id !== head.id))
        sendRef.current(head.text, head.attachments, head.displayText, head.developerInstructions)
      })
      .catch(error => setSyncWarning(`队列消息出队失败：${error instanceof Error ? error.message : String(error)}`))
      .finally(() => { dispatchingQueueIdRef.current = null })
  }, [channel, publicWithoutLogin, running, pending, backgroundTasks.length, queued, queueReleaseVersion])

  const interrupt = useCallback(() => {
    // 不在点击时乐观结束运行态：消息可能因 WS 断开根本没有发出。
    // 只有后端收到 sidecar 的 result(interrupted) 后，applyEvent 才会把 running 置回 false。
    if (interrupting) return
    if (sendRaw({ type: 'interrupt' })) setInterrupting(true)
  }, [interrupting, sendRaw])

  /**
   * 切换「弹窗自动允许」：落本地偏好 + 告知服务端，之后由 sidecar 内同步裁决。
   *
   * 下发给服务端的值要 && 上「当前是全自动模式」——sidecar 侧的 autoApprove 刻意不看它自己的 mode
   * （它的 mode 正是会 desync 成 default 的那个东西，看了就等于没兜底），所以「该不该放行」这个
   * 意图判断只能由前端这边做完再下发。模式切走时必须把它降为 false，否则 default/plan 模式下
   * 会继续静默放行，那是用户明确想逐条把关的场景。
   */
  const syncAutoApprove = useCallback((on: boolean, m: PermissionMode) => {
    if (channel === 'consult') return
    sendRaw({ type: 'setAutoApprove', autoApprove: on && m === 'bypassPermissions' })
  }, [channel, sendRaw])

  const setAutoApprove = useCallback((on: boolean) => {
    if (channel === 'consult') {
      setAutoApproveState(false)
      autoApproveRef.current = false
      return
    }
    setAutoApproveState(on)
    try { localStorage.setItem(AUTO_APPROVE_KEY, on ? '1' : '0') } catch { /* 隐私模式忽略 */ }
    syncAutoApprove(on, modeRef.current)
  }, [channel, syncAutoApprove])

  const setMode = useCallback((m: PermissionMode) => {
    if (channel === 'consult') {
      setModeState('plan')
      modeRef.current = 'plan'
      return
    }
    setModeState(m) // 乐观更新；下一轮 query 生效
    const sid = sessionIdRef.current
    if (sid) saveMode(sid, m) // 按会话持久化，刷新/重连后由 ready 恢复
    sendRaw({ type: 'setMode', mode: m })
    // 模式变了要重算自动放行：切出全自动就必须收回，否则 sidecar 会继续静默放行
    syncAutoApprove(autoApproveRef.current, m)
  }, [channel, sendRaw, syncAutoApprove])

  /**
   * 「弹窗自动允许」的前端兜底：主路径是 sidecar 内同步放行（见 permissions.ts 的 autoApprove），
   * 那条路生效时权限框根本到不了前端。所以框既然弹到了这里，就说明 sidecar 那层没生效——
   * 典型是后端版本旧（不认 setAutoApprove）、或该开关还没同步上。此时在这里补一次 allow。
   *
   * 两条路天然幂等，不是二选一：sidecar 放行了就没有弹窗，有弹窗才轮到这里。放在 hook 里而不是
   * 某个页面组件里，才能保证全屏页/浮窗/分屏任一形态下都在跑（以前三处各抄一份，页面一切走就全失效）。
   */
  const autoApprovedRef = useRef<string | null>(null)
  useEffect(() => {
    // 只在「全自动」下兜底：该开关的语义就是全自动模式的补充，其它模式下用户是想逐条把关的。
    if (!autoApprove || mode !== 'bypassPermissions') return
    if (pending?.kind !== 'permission') return
    if (autoApprovedRef.current === pending.reqId) return // 同一请求只自动放行一次
    autoApprovedRef.current = pending.reqId
    decide({ type: 'decision', reqId: pending.reqId, behavior: 'allow' })
  }, [pending, autoApprove, mode, decide])

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

  // 能力刷新不触发模型调用：Codex 重新计算平台注入的 MCP；Claude 重发最近一次 SDK init 快照。
  const refreshCapabilities = useCallback(() => {
    setCapabilitiesRefreshing(true)
    sendRaw({ type: 'refreshCapabilities' })
    window.setTimeout(() => setCapabilitiesRefreshing(false), 10_000)
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
    const normalizedMode = normalizePermissionModeForEngine(engine, modeRef.current)
    if (normalizedMode !== modeRef.current) {
      setModeState(normalizedMode)
      modeRef.current = normalizedMode
      const sid = sessionIdRef.current
      if (sid) saveMode(sid, normalizedMode)
      sendRaw({ type: 'setMode', mode: normalizedMode })
      syncAutoApprove(autoApproveRef.current, normalizedMode)
    }
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
    // 切换 provider 一律先清模型列表：官方↔第三方各自清单不同，残留会串（官方 5 个显示到第三方等）。
    // 随后 sidecar 按新 provider 重发缓存 / 首轮 supportedModels 补上正确清单。
    setModels([]); setCurrentModel(null)
    // 关键：同步更新重连意图快照。新建会话的 intent 是带初始 provider 的 'open'，若不更新，一旦重连
    // flushIntent 会重放旧 open（带原 baseUrl）→ 把刚切好的 provider 又覆盖回去（切回官方却被弹回三方的根因）。
    const it = intentRef.current
    if (it && it.kind === 'open') {
      intentRef.current = { ...it, apiBaseUrl: baseUrl, authToken: token }
    }
    sendRaw({ type: 'switchProvider', apiBaseUrl: baseUrl, authToken: token })
  }, [sendRaw])

  // 保留到指定回答为止并分叉新会话（旧会话保留）。
  const forkSession = useCallback((upToMessageId: string) => {
    sendRaw({ type: 'forkSession', upToMessageId })
  }, [sendRaw, syncAutoApprove])

  const dismissSyncWarning = useCallback(() => setSyncWarning(null), [])

  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { autoApproveRef.current = autoApprove }, [autoApprove])

  // 保持 switchToRef 指向最新 switchTo，供 applyEvent('forked') 调用而不进依赖环
  useEffect(() => {
    switchToRef.current = switchTo
  }, [switchTo])

  const loadHistory = useCallback(async (reset: boolean) => {
    const sid = sdkSessionIdRef.current
    if ((!sid && channel !== 'review') || historyLoadingRef.current) return
    if (!reset && historyExhaustedRef.current) return
    historyLoadingRef.current = true
    setHistoryLoading(true)
    try {
      const before = reset ? null : historyBeforeRef.current
      const { items: hist, nextBefore } = channel === 'review' && reviewToken
        ? await loadPublicReviewMessages(reviewToken, before)
        : await loadMessages(sid!, cwdRef.current, before)
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
  }, [channel, reviewToken])

  // 让 applyEvent(ready 回调)能在不进依赖环的情况下触发首屏历史加载
  useEffect(() => {
    loadHistoryRef.current = loadHistory
  }, [loadHistory])

  // ── QUERY_FAILED 自动恢复说明 ────────────────────────────────────────────
  // "No conversation found" 的根本修复在 sidecar（sessionManager.ts）：
  //   runTurn() catch 住该错误 → 清空 sdkSessionId → continue 重试（无 resume）
  //   → Claude Agent SDK 以新会话执行同一条用户消息 → 前端感知不到任何错误
  //
  // 因此前端不再需要自动 resumeCurrent / switchTo 的重试逻辑（那套逻辑反而会：
  //   1. 先把错误条目移除（700ms 后）让用户看不到「新建同目录会话」按钮
  //   2. 引发自动重发导致的死循环）。
  //
  // 若 sidecar 三次重试后仍失败（极少数情况），错误条目留在界面，
  // MessageList 的 isPermanentlyLost 分支会显示「新建会话（同目录）」按钮供用户点击。
  //
  // applyEvent 'ready' 分支里 expectingReadyRef / pendingResendRef 相关代码已保留，
  // 但在正常流程下不会被触发（expectingReadyRef 始终为 false）。
  const expectingReadyRef = useRef(false)
  const pendingResendRef = useRef<{ text: string; forSessionId: string } | null>(null)
  // 「清理异常并继续」：分叉到出错前最后一条正常用户消息后，待新会话 ready 时自动补发其文本。
  const forkResendRef = useRef<string | null>(null)
  // items 的最新快照（供 cleanRetry 在回调里读取当前列表，避免闭包旧值）。
  const itemsRef = useRef<ChatItem[]>(items)
  useEffect(() => { itemsRef.current = items }, [items])

  /**
   * 清理异常并继续：会话被坏 thinking 块等毒化后每轮都报错时，分叉到出错前最后一条带 sdkUuid 的
   * 用户消息（丢掉中毒的助手回合），切到干净新会话并自动补发该用户文本，续上上下文。
   */
  const cleanRetry = useCallback(() => {
    const its = itemsRef.current
    let targetUuid: string | undefined
    let targetText = ''
    for (let i = its.length - 1; i >= 0; i--) {
      const it = its[i]
      if (it.kind === 'user' && it.sdkUuid) { targetUuid = it.sdkUuid; targetText = it.text ?? ''; break }
    }
    if (!targetUuid) return
    forkResendRef.current = targetText
    setErrorMessage(null)
    if (!sendRaw({ type: 'forkSession', upToMessageId: targetUuid })) {
      // WS 未连上：分叉依赖存活会话，先重连；连上后用户可再次触发
      forkResendRef.current = null
      connect()
    }
  }, [sendRaw, connect])

  return { state, sessionId, items, pending, pendingSessions, running, interrupting, errorMessage, syncWarning, dismissSyncWarning, mode, autoApprove, slashCommands, skills, agents, mcpServers, outputStyle, capabilitiesRefreshing, models, modelsRefreshing, currentModel, codexReasoningEffort, codexSpeed, currentEngine, currentProviderKind, currentProviderBaseUrl, providerDiag, turnTokens, backgroundTasks, open, switchTo, duplicateSession, duplicatingSessionId, resumeHistory, resumeCurrent, send, queued, queuePausedReason, enqueue, removeQueued, sendQueuedNow, clearQueued, decide, interrupt, setMode, setAutoApprove, setModel, refreshModels, refreshCapabilities, setCodexOptions, switchEngine, switchProvider, forkSession, cleanRetry, historyLoading, historyExhausted, loadHistory }
}

function findRecoverableCommandFailure(items: ChatItem[], toolName: string): number {
  const minimum = Math.max(0, items.length - 6)
  for (let index = items.length - 1; index >= minimum; index -= 1) {
    const item = items[index]
    if (item.kind === 'result' || item.kind === 'user') break
    if (item.kind !== 'activity' || !['shellSyntax', 'argumentEscaping'].includes(item.outcome ?? '')) continue
    const data = item.data && typeof item.data === 'object' && !Array.isArray(item.data)
      ? item.data as Record<string, unknown>
      : undefined
    if (!data?.toolName || data.toolName === toolName) return index
  }
  return -1
}

function isRunningActivity(status: string): boolean {
  return status === 'inProgress' || status === 'in_progress' || status === 'running'
    || status === 'pending' || status === 'started'
}
