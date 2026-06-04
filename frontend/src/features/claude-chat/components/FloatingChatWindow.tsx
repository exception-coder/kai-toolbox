import { useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Maximize2, MessageSquare, Minus, Send, X } from 'lucide-react'
import { CHAT_ROUTE, useChatRuntime } from '../runtime/ChatRuntimeContext'
import { MessageList } from './MessageList'

const WIDTH = 340
const MIN_MARGIN = 8

/**
 * 跨路由常驻的可拖拽悬浮对话窗。仅在「已弹出 + 引擎已激活 + 当前不在会话页」时渲染，
 * 避免与全屏会话页双份 UI。操作的是 Context 里的同一聊天实例（同一 WS、同一会话）。
 */
export function FloatingChatWindow() {
  const { chat, floating, setFloating, minimized, setMinimized, pos, setPos } = useChatRuntime()
  const location = useLocation()
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)

  // 在会话页时不渲染（全屏页已在），未弹出或引擎未就绪也不渲染
  if (!floating || !chat || location.pathname === CHAT_ROUTE) return null

  const clamp = (x: number, y: number) => ({
    x: Math.max(MIN_MARGIN, Math.min(x, window.innerWidth - WIDTH - MIN_MARGIN)),
    y: Math.max(MIN_MARGIN, Math.min(y, window.innerHeight - 80)),
  })

  const onPointerDown = (e: React.PointerEvent) => {
    // 输入框/按钮上不发起拖拽
    if ((e.target as HTMLElement).closest('button, textarea, input')) return
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    setPos(clamp(e.clientX - d.dx, e.clientY - d.dy))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  }

  const submit = () => {
    const t = draft.trim()
    if (!t || chat.running) return
    chat.send(t)
    setDraft('')
  }

  // 最小化：缩成可点击的小气泡
  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        aria-label="展开 Vibe Coding 悬浮窗"
        className="fixed z-50 flex size-12 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-lg"
        style={{ left: pos.x, top: pos.y }}
      >
        <MessageSquare className="size-5" />
        {chat.running && <span className="absolute right-0 top-0 size-3 animate-pulse rounded-full bg-amber-400" />}
      </button>
    )
  }

  return (
    <div
      className="fixed z-50 flex flex-col overflow-hidden rounded-xl border bg-[var(--color-background)] shadow-2xl"
      style={{ left: pos.x, top: pos.y, width: WIDTH, height: 'min(60vh, 520px)' }}
    >
      {/* 标题栏 = 拖拽手柄 */}
      <header
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex cursor-move touch-none items-center gap-2 border-b bg-[var(--color-muted)] px-3 py-2 select-none"
      >
        <MessageSquare className="size-4" />
        <span className="text-sm font-semibold">Vibe Coding</span>
        <span className="text-xs text-[var(--color-muted-foreground)]">{chat.running ? '思考中…' : ''}</span>
        <div className="ml-auto flex gap-0.5">
          <button type="button" onClick={() => navigate(CHAT_ROUTE)} aria-label="展开为全屏" title="展开为全屏"
            className="rounded p-1 hover:bg-[var(--color-background)]">
            <Maximize2 className="size-4" />
          </button>
          <button type="button" onClick={() => setMinimized(true)} aria-label="最小化" title="最小化"
            className="rounded p-1 hover:bg-[var(--color-background)]">
            <Minus className="size-4" />
          </button>
          <button type="button" onClick={() => setFloating(false)} aria-label="关闭悬浮窗" title="关闭"
            className="rounded p-1 hover:bg-[var(--color-background)]">
            <X className="size-4" />
          </button>
        </div>
      </header>

      {/* 消息流（复用全屏页同款渲染） */}
      <MessageList items={chat.items} running={chat.running} onFork={chat.forkSession} />

      {/* 精简输入区 */}
      <div className="flex items-end gap-2 border-t p-2">
        <textarea
          className="max-h-24 min-h-[2.25rem] flex-1 resize-none rounded-lg border bg-[var(--color-background)] px-2 py-1.5 text-sm"
          placeholder="发消息…（Shift+Enter 发送）"
          rows={1}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); submit() } }}
        />
        {chat.running ? (
          <button type="button" onClick={chat.interrupt} aria-label="中断"
            className="rounded-lg border px-3 py-2 text-sm">中断</button>
        ) : (
          <button type="button" onClick={submit} disabled={!draft.trim()} aria-label="发送"
            className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-[var(--color-primary-foreground)] disabled:opacity-50">
            <Send className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}
