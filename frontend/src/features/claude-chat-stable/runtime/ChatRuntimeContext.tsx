import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useClaudeChatSocket, type UseClaudeChatSocket } from '../hooks/useClaudeChatSocket'
import { useGrabGesture, type GestureStatus } from '../hooks/useGrabGesture'
import { GestureFlourish, type GestureFlash } from '../components/GestureFlourish'
import { listSessions } from '../api'

/** Vibe Coding 会话页路由；落在此路由即激活引擎（懒启动）。 */
export const CHAT_ROUTE = '/tools/claude-chat-stable'
export const CHAT_STABLE_ROUTE = CHAT_ROUTE
export function isChatRoute(pathname: string) {
  return pathname === CHAT_ROUTE || pathname === CHAT_STABLE_ROUTE
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
const FLOAT_STATE_KEY = 'kai-toolbox:claude-chat-stable:float-state'
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

const Ctx = createContext<ChatRuntime | null>(null)

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
  const activate = useCallback(() => setActive(true), [])
  const setVoiceMode = useCallback((v: boolean) => {
    if (v) setActive(true)
    setVoiceModeState(v)
  }, [])

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
  const [gestureOn, setGestureOn] = useState(() => { try { return localStorage.getItem('kai-toolbox:chat-stable-gesture') === '1' } catch { return false } })
  const [gestureStatus, setGestureStatus] = useState<GestureStatus>('idle')
  const [gestureError, setGestureError] = useState<string | null>(null)
  const [gestureFlash, setGestureFlash] = useState<GestureFlash | null>(null)
  const [gesturePaused, setGesturePaused] = useState(false)
  const flashSeq = useRef(0)
  const toggleGesture = useCallback(() => setGestureOn(v => {
    const nv = !v
    try { localStorage.setItem('kai-toolbox:chat-stable-gesture', nv ? '1' : '0') } catch { /* ignore */ }
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
      <ChatEngine control={control} demo={demo}>{children}</ChatEngine>
      {flourish}
    </>
  )
}

/** 真正持有聊天实例的常驻组件：调一次 hook，经 Context 暴露给会话页与浮窗。 */
function ChatEngine({ control, demo, children }: { control: Omit<ChatRuntime, 'chat'>; demo: boolean; children: ReactNode }) {
  const chat = useClaudeChatSocket(demo ? { demo: true } : undefined)

  // 挂载即开一次会话：demo 直接 open（服务端供给受约束副本沙箱，忽略入参）；
  // 正式态续接最近一条会话（原在 ChatPage，迁到引擎挂载时跑一次）。
  const autoOpenedRef = useRef(false)
  const chatRef = useRef(chat)
  chatRef.current = chat
  useEffect(() => {
    if (autoOpenedRef.current) return
    autoOpenedRef.current = true
    if (demo) {
      // 全自动：受约束演示无人审批，权限模式直接 bypassPermissions（工具放行仍由沙箱 canUseTool 兜底）。
      chatRef.current.open('', undefined, 'bypassPermissions')
      return
    }
    void (async () => {
      try {
        const sessions = await listSessions()
        if (sessions.length === 0) return
        const latest = [...sessions].sort((a, b) => b.lastSeenAt - a.lastSeenAt)[0]
        // 刷新恢复：若该会话仍在回答（后端 status=RUNNING 且挂在活跃 sidecar 上），带上 hint 立即显示「中断」，
        // 避免页面还没感知到就误显示发送按钮。Ready 回来会校正。
        chatRef.current.switchTo(latest.id, latest.status === 'RUNNING' && latest.live)
      } catch {
        // 列表拉取失败：保持空态，用户可手动新建/选择
      }
    })()
  }, [demo])

  return <Ctx.Provider value={{ ...control, chat }}>{children}</Ctx.Provider>
}
