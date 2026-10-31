import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type Context, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { UseClaudeChatSocket } from '../hooks/useClaudeChatSocket'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useGrabGesture, type GestureStatus } from '../hooks/useGrabGesture'
import { GestureFlourish, type GestureFlash } from '../components/GestureFlourish'
import {
  EMERGENCY_REPAIR_REQUEST_EVENT,
  publishEmergencyRepairStatus,
  type EmergencyRepairRequest,
} from '@/lib/emergencyRepair'
import { chatControlMode } from '../lib/controlMode'
import { useAccessContext } from '@/shell/permission'
import { reportVibeEntry } from '@/lib/vibeEntryDiagnostics'

const ChatEngine = lazy(() => import('./ChatRuntimeEngine').then(module => ({ default: module.ChatRuntimeEngine })))

/** Vibe Coding 会话页路由；落在此路由即激活引擎（懒启动）。 */
export const CHAT_ROUTE = '/tools/claude-chat'
export function isChatRoute(pathname: string, search = '') {
  return pathname === CHAT_ROUTE && chatControlMode(search) === 'CODE_AGENT'
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
  useEffect(() => { reportVibeEntry('shell_mount', 'ok', null, true) }, [])
  // 读一次本地持久化的悬浮窗形态（刷新后恢复）。demo 模式不读持久化、强制激活+弹出。
  const persisted = useMemo(() => (demo ? null : loadFloatState()), [demo])
  // 上次处于弹出态（或 demo）→ 初始即激活引擎，否则 chat 为 null 悬浮窗仍不渲染
  const [chat, setChat] = useState<UseClaudeChatSocket | null>(null)
  const [active, setActive] = useState(() => demo || persisted?.floating === true)
  const [floating, setFloating] = useState(() => demo || (persisted?.floating ?? false))
  const [minimized, setMinimized] = useState(() => persisted?.minimized ?? false)
  const [pos, setPos] = useState<FloatPos>(() => persisted?.pos ?? DEFAULT_POS)
  const [size, setSize] = useState<FloatSize>(() => persisted?.size ?? DEFAULT_SIZE)
  const [concierge, setConcierge] = useState<string | null>(null)
  const [emergencyRepair, setEmergencyRepair] = useState<EmergencyRepairRequest | null>(null)
  const handleEmergencyRepairDone = useCallback(() => setEmergencyRepair(null), [])
  const activate = useCallback(() => setActive(true), [])

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
  const access = useAccessContext()
  const canOpenAgent = access.superAdmin || access.roles.includes('ADMIN') || access.permissionCodes.includes('menu:claude-chat')
    || new URLSearchParams(location.search).has('prdSessionId')
  // 记住进入会话页前最后访问的非会话路由，弹出悬浮窗时回到这里（而非每次回首页）
  const lastRouteRef = useRef('/')
  const getReturnRoute = useCallback(() => lastRouteRef.current, [])

  // 落在会话页即激活引擎（懒启动）；否则记录为「返回路由」
  useEffect(() => {
    if (isChatRoute(location.pathname, location.search) && canOpenAgent) setActive(true)
    else lastRouteRef.current = location.pathname + location.search
  }, [location.pathname, location.search, canOpenAgent])

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
    enabled: gestureOn && !gesturePaused && (isChatRoute(location.pathname, location.search) || floating),
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

  const control = { demo, concierge, setConcierge, active, activate, floating, setFloating, minimized, setMinimized, pos, setPos, size, setSize, getReturnRoute, gestureOn, toggleGesture, gestureStatus, gestureError, gesturePaused, setGesturePaused }
  const flourish = <GestureFlourish flash={gestureFlash} onDone={() => setGestureFlash(null)} />

  return (
    <Ctx.Provider value={{ ...control, chat }}>
      {children}
      {active && <ErrorBoundary label="chat-engine" compact>
        <Suspense fallback={null}>
          <ChatEngine demo={demo} emergencyRepair={emergencyRepair}
            onEmergencyRepairHandled={handleEmergencyRepairDone} onChat={setChat} />
        </Suspense>
      </ErrorBoundary>}
      {flourish}
    </Ctx.Provider>
  )
}
