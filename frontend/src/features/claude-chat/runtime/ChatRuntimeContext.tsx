import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useClaudeChatSocket, type UseClaudeChatSocket } from '../hooks/useClaudeChatSocket'
import { listSessions } from '../api'

/** Vibe Coding 会话页路由；落在此路由即激活引擎（懒启动）。 */
export const CHAT_ROUTE = '/tools/claude-chat'

interface FloatPos {
  x: number
  y: number
}

interface ChatRuntime {
  /** 共享聊天实例；引擎未激活时为 null（仅出现在首次激活前一帧）。 */
  chat: UseClaudeChatSocket | null
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
export function ChatRuntimeProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false)
  const [floating, setFloating] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [pos, setPos] = useState<FloatPos>({ x: 12, y: 84 })
  const activate = useCallback(() => setActive(true), [])
  const location = useLocation()

  // 落在会话页即激活引擎（懒启动）
  useEffect(() => {
    if (location.pathname === CHAT_ROUTE) setActive(true)
  }, [location.pathname])

  const control = { active, activate, floating, setFloating, minimized, setMinimized, pos, setPos }

  if (!active) {
    return <Ctx.Provider value={{ ...control, chat: null }}>{children}</Ctx.Provider>
  }
  return (
    <ChatEngine control={control}>{children}</ChatEngine>
  )
}

/** 真正持有聊天实例的常驻组件：调一次 hook，经 Context 暴露给会话页与浮窗。 */
function ChatEngine({ control, children }: { control: Omit<ChatRuntime, 'chat'>; children: ReactNode }) {
  const chat = useClaudeChatSocket()

  // 自动续接最近会话（原在 ChatPage，迁到引擎挂载时跑一次）
  const autoOpenedRef = useRef(false)
  const chatRef = useRef(chat)
  chatRef.current = chat
  useEffect(() => {
    if (autoOpenedRef.current) return
    autoOpenedRef.current = true
    void (async () => {
      try {
        const sessions = await listSessions()
        if (sessions.length === 0) return
        const latest = [...sessions].sort((a, b) => b.lastSeenAt - a.lastSeenAt)[0]
        chatRef.current.switchTo(latest.id)
      } catch {
        // 列表拉取失败：保持空态，用户可手动新建/选择
      }
    })()
  }, [])

  return <Ctx.Provider value={{ ...control, chat }}>{children}</Ctx.Provider>
}
