import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Context, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useClaudeChatSocket, type UseClaudeChatSocket } from '../hooks/useClaudeChatSocket'
import { useGrabGesture, type GestureStatus } from '../hooks/useGrabGesture'
import { GestureFlourish, type GestureFlash } from '../components/GestureFlourish'
import { getSelfRepo, listSessions, renameSession } from '../api'
import {
  EMERGENCY_REPAIR_REQUEST_EVENT,
  publishEmergencyRepairStatus,
  type EmergencyRepairRequest,
} from '@/lib/emergencyRepair'
import { isVibeCodingSession } from '../lib/sessionScope'

/** Vibe Coding 会话页路由；落在此路由即激活引擎（懒启动）。 */
export const CHAT_ROUTE = '/tools/claude-chat'
export function isChatRoute(pathname: string) {
  return pathname === CHAT_ROUTE
}

interface FloatPos {
  x: number
  y: number
}

interface FloatSize {
  w: number
  h: number
}

/** 悬浮窗形态持久化：刷新后恢复「上次是否弹出 / 最小化 / 位置 / 尺寸」。 */
const FLOAT_STATE_KEY = 'kai-toolbox:claude-chat:float-state'
const DEFAULT_POS: FloatPos = { x: 12, y: 84 }
const DEFAULT_SIZE: FloatSize = { w: 360, h: 520 }

interface PersistedFloat {
  floating: boolean
  minimized: boolean
  pos: FloatPos
  size: FloatSize
}

function loadFloatState(): PersistedFloat | null {
  try {
    const raw = localStorage.getItem(FLOAT_STATE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Partial<PersistedFloat>
    if (typeof o?.floating !== 'boolean') return null
    const posOk = o.pos && typeof o.pos.x === 'number' && typeof o.pos.y === 'number'
    const sizeOk = o.size && typeof o.size.w === 'number' && typeof o.size.h === 'number'
    // 视口可能变小，轻量夹取保证至少标题栏/气泡可点到
    const pos = posOk
      ? { x: Math.max(0, Math.min(o.pos!.x, window.innerWidth - 48)), y: Math.max(0, Math.min(o.pos!.y, window.innerHeight - 48)) }
      : DEFAULT_POS
    return {
      floating: o.floating,
      minimized: !!o.minimized,
      pos,
      size: sizeOk ? { w: o.size!.w, h: o.size!.h } : DEFAULT_SIZE,
    }
  } catch {
    return null
  }
}

interface ChatRuntime {
  /** 共享聊天实例；引擎未激活时为 null（仅出现在首次激活前一帧）。 */
  chat: UseClaudeChatSocket | null
  /** 受约束免登录演示模式：悬浮窗据此屏蔽无关功能、只留缩小/展开。 */
  demo: boolean
  /** 悬浮窗吉祥物图 URL 覆盖（demo 演示页按主题注入）；null=用内置默认。 */
  concierge: string | null
  setConcierge: (v: string | null) => void
  /** 引擎是否已挂载（懒启动后常驻）。 */
  active: boolean
  /** 主动激活引擎（如弹出浮窗时）。 */
  activate: () => void
  /** 是否显示悬浮窗。 */
  floating: boolean
  setFloating: (v: boolean) => void
  /** 悬浮窗是否最小化成气泡。 */
  minimized: boolean
  setMinimized: (v: boolean) => void
  /** 悬浮窗左上角位置（fixed，px）。 */
  pos: FloatPos
  setPos: (p: FloatPos) => void
  /** 悬浮窗尺寸（px），可拖拽调整，跨路由持久。 */
  size: FloatSize
  setSize: (s: FloatSize) => void
  /** 是否进入「电子鱼语音模式」全屏视图。与悬浮窗/会话页共用同一聊天实例，跨路由保持。 */
  voiceMode: boolean
  setVoiceMode: (v: boolean) => void
  /** 弹出悬浮窗时应返回的路由 = 进入会话页前最后访问的非会话路由（默认 /）。 */
  getReturnRoute: () => string
  /** 手势控制开关（默认关）：开后在会话页或悬浮态监控摄像头——抓握=弹出悬浮窗，展开=返回会话页。 */
  gestureOn: boolean
  toggleGesture: () => void
  /** 手势监控状态与错误（供 UI 显示指示/提示）。 */
  gestureStatus: GestureStatus
  gestureError: string | null
  /** 临时暂停手势监控（占用摄像头的场景，如「手势自检」面板运行时），避免同标签内抢摄像头。 */
  gesturePaused: boolean
  setGesturePaused: (v: boolean) => void
}

const CHAT_RUNTIME_CONTEXT_KEY = '__kaiToolboxChatRuntimeContext__'
const runtimeGlobal = globalThis as typeof globalThis & {
  [CHAT_RUNTIME_CONTEXT_KEY]?: Context<ChatRuntime | null>
}

// Provider 与消费方可能在开发热更新时经不同 chunk 重新求值。把 Context 固定到页面全局，
// 避免同一标签页内出现两个身份不同的 Context，导致已包裹 Provider 仍读取到 null。
const Ctx = runtimeGlobal[CHAT_RUNTIME_CONTEXT_KEY] ?? createContext<ChatRuntime | null>(null)
runtimeGlobal[CHAT_RUNTIME_CONTEXT_KEY] = Ctx

/** 读取聊天运行时（含共享实例与悬浮窗控制）。须在 ChatRuntimeProvider 内使用。 */
export function useChatRuntime(): ChatRuntime {
  const c = useContext(Ctx)
  if (!c) throw new Error('useChatRuntime 必须在 ChatRuntimeProvider 内使用')
  return c
}

/**
 * 聊天运行时 Provider：挂在路由之上（AppShell 内容区），让聊天实例的生命周期与路由解耦。
 * 懒启动——仅在首次进入会话页 / 弹出浮窗后才挂载 ChatEngine（避免未使用就拉起 sidecar）；
 * 一旦激活即常驻，跨路由不卸载，保证 WS 与会话状态延续。
 */
export function ChatRuntimeProvider({ children, demo = false }: { children: ReactNode; demo?: boolean }) {
  // 读一次本地持久化的悬浮窗形态（刷新后恢复）。demo 模式不读持久化、强制激活+弹出。
  const persisted = useMemo(() => (demo ? null : loadFloatState()), [demo])
  // 上次处于弹出态（或 demo）→ 初始即激活引擎，否则 chat 为 null 悬浮窗仍不渲染
  const [active, setActive] = useState(() => demo || persisted?.floating === true)
  const [floating, setFloating] = useState(() => demo || (persisted?.floating ?? false))
  const [minimized, setMinimized] = useState(() => persisted?.minimized ?? false)
  const [pos, setPos] = useState<FloatPos>(() => persisted?.pos ?? DEFAULT_POS)
  const [size, setSize] = useState<FloatSize>(() => persisted?.size ?? DEFAULT_SIZE)
  // 语音模式不持久化（刷新回到普通态，避免重连即弹全屏）；进入即懒激活引擎。
  const [voiceMode, setVoiceModeState] = useState(false)
  const [concierge, setConcierge] = useState<string | null>(null)
  const [emergencyRepair, setEmergencyRepair] = useState<EmergencyRepairRequest | null>(null)
  const handleEmergencyRepairDone = useCallback(() => setEmergencyRepair(null), [])
  const activate = useCallback(() => setActive(true), [])
  const setVoiceMode = useCallback((v: boolean) => {
    if (v) setActive(true)
    setVoiceModeState(v)
  }, [])

  // shell 错误边界不依赖任何业务 feature；收到紧急修复事件后先激活常驻聊天引擎，
  // 即使 Vibe Coding 页面自己的 chunk/import 已崩溃，也能从这里创建并发送修复会话。
  useEffect(() => {
    if (demo) return
    const onEmergencyRepair = (event: Event) => {
      const request = (event as CustomEvent<EmergencyRepairRequest>).detail
      if (!request?.id) return
      setEmergencyRepair(request)
      setActive(true)
      publishEmergencyRepairStatus({ id: request.id, state: 'starting', message: '正在检查现有会话并启动临时修复…' })
    }
    window.addEventListener(EMERGENCY_REPAIR_REQUEST_EVENT, onEmergencyRepair)
    return () => window.removeEventListener(EMERGENCY_REPAIR_REQUEST_EVENT, onEmergencyRepair)
  }, [demo])

  // 形态变化即写回本地（节流意义不大，状态变更频率低）。demo 不持久化，避免覆盖正式悬浮窗形态。
  useEffect(() => {
    if (demo) return
    try {
      localStorage.setItem(FLOAT_STATE_KEY, JSON.stringify({ floating, minimized, pos, size }))
    } catch {
      // 忽略隐私模式/配额异常
    }
  }, [demo, floating, minimized, pos, size])
  const location = useLocation()
  const navigate = useNavigate()
  // 记住进入会话页前最后访问的非会话路由，弹出悬浮窗时回到这里（而非每次回首页）
  const lastRouteRef = useRef('/')
  const getReturnRoute = useCallback(() => lastRouteRef.current, [])

  // 落在会话页即激活引擎（懒启动）；否则记录为「返回路由」
  useEffect(() => {
    if (isChatRoute(location.pathname)) setActive(true)
    else lastRouteRef.current = location.pathname + location.search
  }, [location.pathname, location.search])

  // ── 手势控制（默认关）：抓握=弹出悬浮窗；展开=返回会话页。仅在会话页或悬浮态监控（Vibe Coding 模块内）──
  const [gestureOn, setGestureOn] = useState(() => { try { return localStorage.getItem('kai-toolbox:chat-gesture') === '1' } catch { return false } })
  const [gestureStatus, setGestureStatus] = useState<GestureStatus>('idle')
  const [gestureError, setGestureError] = useState<string | null>(null)
  const [gestureFlash, setGestureFlash] = useState<GestureFlash | null>(null)
  const [gesturePaused, setGesturePaused] = useState(false)
  const flashSeq = useRef(0)
  const toggleGesture = useCallback(() => setGestureOn(v => {
    const nv = !v
    try { localStorage.setItem('kai-toolbox:chat-gesture', nv ? '1' : '0') } catch { /* ignore */ }
    if (!nv) { setGestureStatus('idle'); setGestureError(null) }
    return nv
  }), [])
  useGrabGesture({
    enabled: gestureOn && !gesturePaused && (isChatRoute(location.pathname) || floating),
    onStatus: setGestureStatus,
    onError: setGestureError,
    onGesture: g => {
      if (g === 'Closed_Fist') {
        setGestureFlash({ kind: 'grab', id: ++flashSeq.current })
        if (!floating) { setActive(true); setFloating(true); setMinimized(false); navigate(getReturnRoute()) }
      } else if (g === 'Open_Palm') {
        setGestureFlash({ kind: 'open', id: ++flashSeq.current })
        if (floating) { setFloating(false); setMinimized(false); navigate(CHAT_ROUTE) }
      }
    },
  })

  const control = { demo, concierge, setConcierge, active, activate, floating, setFloating, minimized, setMinimized, pos, setPos, size, setSize, voiceMode, setVoiceMode, getReturnRoute, gestureOn, toggleGesture, gestureStatus, gestureError, gesturePaused, setGesturePaused }
  const flourish = <GestureFlourish flash={gestureFlash} onDone={() => setGestureFlash(null)} />

  if (!active) {
    return <Ctx.Provider value={{ ...control, chat: null }}>{children}{flourish}</Ctx.Provider>
  }
  return (
    <>
      <ChatEngine
        control={control}
        demo={demo}
        emergencyRepair={emergencyRepair}
        onEmergencyRepairHandled={handleEmergencyRepairDone}
      >
        {children}
      </ChatEngine>
      {flourish}
    </>
  )
}

/** 真正持有聊天实例的常驻组件：调一次 hook，经 Context 暴露给会话页与浮窗。 */
function ChatEngine({
  control,
  demo,
  emergencyRepair,
  onEmergencyRepairHandled,
  children,
}: {
  control: Omit<ChatRuntime, 'chat'>
  demo: boolean
  emergencyRepair: EmergencyRepairRequest | null
  onEmergencyRepairHandled: () => void
  children: ReactNode
}) {
  const location = useLocation()
  const routePrdSessionId = useMemo(
    () => new URLSearchParams(location.search).get('prdSessionId')?.trim() || null,
    [location.search],
  )
  // 离开会话页弹成浮窗后仍保留本次 PRD 授权范围，避免重连退回 ADMIN 通道。
  const [prdSessionId, setPrdSessionId] = useState<string | null>(routePrdSessionId)
  useEffect(() => {
    if (routePrdSessionId) setPrdSessionId(routePrdSessionId)
  }, [routePrdSessionId])
  // 路由参数必须在本次 render 就决定连接通道，不能等上面的 state effect 再切换。
  // 否则“打开已绑定开发会话”会先在 ADMIN 通道发 switch，下一拍才重连 PRD 通道；
  // 首次 switch 的去重标记却被保留，最终左侧有会话、右侧 currentSession 仍为空。
  const effectivePrdSessionId = routePrdSessionId ?? prdSessionId
  const chat = useClaudeChatSocket(demo
    ? { demo: true }
    : effectivePrdSessionId
      ? { channel: 'prd-dev', prdSessionId: effectivePrdSessionId }
      : undefined)
  const targetSessionId = useMemo(
    () => new URLSearchParams(location.search).get('sessionId')?.trim() || null,
    [location.search],
  )
  const handledEmergencyRef = useRef<string | null>(null)
  const pendingEmergencyTitleRef = useRef<{ requestId: string; title: string } | null>(null)
  const autoOpenedRef = useRef(false)

  useEffect(() => {
    if (demo || !emergencyRepair || handledEmergencyRef.current === emergencyRepair.id) return
    handledEmergencyRef.current = emergencyRepair.id
    // 紧急任务自己会选择/创建会话，阻止下面的“恢复最近会话”与它并发抢占当前连接。
    autoOpenedRef.current = true
    const request = emergencyRepair
    void (async () => {
      try {
        const [selfRepo, sessions] = await Promise.all([
          getSelfRepo(),
          listSessions().then(items => items.filter(isVibeCodingSession)),
        ])
        if (!selfRepo.exists || !selfRepo.path?.trim()) throw new Error('未配置 kai-toolbox 自维护仓库，无法创建修复会话')

        const normalizedSelf = normalizePath(selfRepo.path)
        const featureNeedles = [request.featureId.toLowerCase()]
        if (request.featureId === 'claude-chat') featureNeedles.push('vibe coding', 'vibe', 'vb')
        const recentConversation = JSON.stringify(chat.items.slice(-30)).toLowerCase()
        const currentSessionMentionsFeature = featureNeedles.some(needle => recentConversation.includes(needle))
        const reusable = sessions.find(session => {
          if (normalizePath(session.cwd) !== normalizedSelf) return false
          if (!session.live) return false
          const title = session.title?.toLowerCase() || ''
          return title.includes('紧急修复')
            || featureNeedles.some(needle => title.includes(needle))
            || (session.id === chat.sessionId && currentSessionMentionsFeature)
        })
        const title = `[紧急修复][${request.featureId}] ${new Date(request.requestedAt).toLocaleString()}`
        const prompt = buildEmergencyRepairPrompt(request)

        if (reusable) {
          chat.switchTo(reusable.id, reusable.status === 'RUNNING' && reusable.live)
          chat.enqueue(prompt, undefined, `紧急修复 ${request.featureId}：检查异常并立即恢复模块`)
          publishEmergencyRepairStatus({
            id: request.id,
            state: 'started',
            sessionId: reusable.id,
            message: `已找到正在处理该模块的会话“${reusable.title || reusable.id.slice(0, 8)}”，修复指令已强制加入队列。`,
          })
        } else {
          pendingEmergencyTitleRef.current = { requestId: request.id, title }
          chat.open(selfRepo.path, undefined, 'bypassPermissions', chat.currentEngine === 'codex' ? 'codex' : 'claude')
          chat.send(prompt, undefined, `紧急修复 ${request.featureId}：检查异常并立即恢复模块`)
          publishEmergencyRepairStatus({
            id: request.id,
            state: 'started',
            message: '未发现正在修复该模块的活跃会话，已创建全自动临时会话并发出修复指令。',
          })
        }
      } catch (error) {
        handledEmergencyRef.current = null
        publishEmergencyRepairStatus({
          id: request.id,
          state: 'failed',
          message: error instanceof Error ? error.message : '紧急修复会话启动失败',
        })
      } finally {
        onEmergencyRepairHandled()
      }
    })()
  }, [chat, demo, emergencyRepair, onEmergencyRepairHandled])

  useEffect(() => {
    const pendingTitle = pendingEmergencyTitleRef.current
    if (!pendingTitle || !chat.sessionId) return
    pendingEmergencyTitleRef.current = null
    renameSession(chat.sessionId, pendingTitle.title).catch(() => {
      // 标题只用于后续复用识别；改名失败不影响已发出的修复任务。
    })
    publishEmergencyRepairStatus({
      id: pendingTitle.requestId,
      state: 'started',
      sessionId: chat.sessionId,
      message: `全自动临时修复会话 ${chat.sessionId.slice(0, 8)} 已开始执行。`,
    })
  }, [chat.sessionId])

  // 挂载即开一次会话：demo 直接 open（服务端供给受约束副本沙箱，忽略入参）；
  // 正式态优先打开路由指定会话，否则续接最近一条会话。
  const switchedTargetRef = useRef<string | null>(null)
  const chatRef = useRef(chat)
  chatRef.current = chat
  // 同一个目标只自动恢复一次，之后允许用户手动“切换会话”接管其它开发会话；
  // 只有路由目标或 PRD 授权通道真正变化时才解除一次性保护并重新恢复。
  useEffect(() => {
    switchedTargetRef.current = null
  }, [effectivePrdSessionId, targetSessionId])
  useEffect(() => {
    if (autoOpenedRef.current) return
    autoOpenedRef.current = true
    if (demo) {
      // 全自动：受约束演示无人审批，权限模式直接 bypassPermissions（工具放行仍由沙箱 canUseTool 兜底）。
      chatRef.current.open('', undefined, 'bypassPermissions')
      return
    }
    if (targetSessionId) {
      switchedTargetRef.current = targetSessionId
      void (async () => {
        try {
          const target = (await listSessions()).find(
            session => session.id === targetSessionId && isVibeCodingSession(session),
          )
          if (!target || switchedTargetRef.current !== targetSessionId) return
          chatRef.current.switchTo(target.id, target.status === 'RUNNING' && target.live)
        } catch {
          // 无法确认会话归属时不绑定，避免业务咨询会话误入 Vibe Coding。
        }
      })()
      return
    }
    // 需求代码节点的新开发 handoff 会由 ChatPage 立即 open；不要先自动切到“最近会话”，
    // 否则负责人范围通道会正确拒绝那条无关会话，并在界面上产生一次误导性的报错。
    if (effectivePrdSessionId) return
    void (async () => {
      try {
        const sessions = (await listSessions()).filter(isVibeCodingSession)
        if (sessions.length === 0) return
        const latest = [...sessions].sort((a, b) => b.lastSeenAt - a.lastSeenAt)[0]
        // 刷新恢复：若该会话仍在回答（后端 status=RUNNING 且挂在活跃 sidecar 上），带上 hint 立即显示「中断」，
        // 避免页面还没感知到就误显示发送按钮。Ready 回来会校正。
        chatRef.current.switchTo(latest.id, latest.status === 'RUNNING' && latest.live)
      } catch {
        // 列表拉取失败：保持空态，用户可手动新建/选择
      }
    })()
  }, [demo, targetSessionId, effectivePrdSessionId])

  useEffect(() => {
    if (demo || !targetSessionId || switchedTargetRef.current === targetSessionId) return
    switchedTargetRef.current = targetSessionId
    void (async () => {
      try {
        const target = (await listSessions()).find(
          session => session.id === targetSessionId && isVibeCodingSession(session),
        )
        if (!target || switchedTargetRef.current !== targetSessionId) return
        chatRef.current.switchTo(target.id, target.status === 'RUNNING' && target.live)
      } catch {
        // 无法确认会话归属时保持当前开发会话。
      }
    })()
  }, [demo, effectivePrdSessionId, targetSessionId])

  // 兼容升级前已经误绑定的页面状态：识别到当前 ID 属于业务咨询后，立即回到最近的开发会话。
  useEffect(() => {
    const activeSessionId = chat.sessionId
    if (demo || !activeSessionId) return
    let cancelled = false
    void (async () => {
      try {
        const sessions = await listSessions()
        const active = sessions.find(session => session.id === activeSessionId)
        if (!active || isVibeCodingSession(active)) return
        const fallback = sessions
          .filter(isVibeCodingSession)
          .sort((a, b) => b.lastSeenAt - a.lastSeenAt)[0]
        if (!cancelled && fallback) {
          chatRef.current.switchTo(fallback.id, fallback.status === 'RUNNING' && fallback.live)
        }
      } catch {
        // 后端通道仍会拒绝跨域绑定；列表查询失败时不做猜测性切换。
      }
    })()
    return () => { cancelled = true }
  }, [demo, chat.sessionId])

  return <Ctx.Provider value={{ ...control, chat }}>{children}</Ctx.Provider>
}

function normalizePath(value: string): string {
  return value.trim().replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
}

function buildEmergencyRepairPrompt(request: EmergencyRepairRequest): string {
  return `这是 kai-toolbox 的紧急自修复任务，请立即执行，不要只给建议。

故障模块：${request.featureId}
故障路由：${request.route}
浏览器错误：${request.errorName}: ${request.errorMessage}

执行要求：
1. 先检查是否已有会话或未提交改动正在修改 Vibe Coding / ${request.featureId} 模块，理解并保留这些增量；严禁 git reset、checkout 覆盖、删除用户改动或擅自提交。
2. 结合错误信息定位真正根因，直接修复模块。若是导入/导出不一致，核对调用端与实际实现，不能只用刷新页面规避。
3. 优先恢复页面可用性，同时检查移动端与相关调用链不再触发同类异常。
4. 至少运行 frontend typecheck；涉及后端或 sidecar 时补充对应编译/测试。
5. 完成后明确说明修改文件、根因、验证结果；如受阻，给出可执行的失败原因。

这是临时紧急会话，请现在开始检查并修复。`
}
