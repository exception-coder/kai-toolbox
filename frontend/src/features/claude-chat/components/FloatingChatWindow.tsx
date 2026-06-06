import { useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { List, Maximize2, MessageSquare, Minus, Plus, Send, X } from 'lucide-react'
import { CHAT_ROUTE, useChatRuntime } from '../runtime/ChatRuntimeContext'
import { MessageList } from './MessageList'
import { SessionList } from './SessionList'
import { PermissionDialog } from './PermissionDialog'
import { QuestionDialog } from './QuestionDialog'
import { AttachmentChips } from './AttachmentChips'
import { uploadAttachment, type UploadedAttachment } from '../api'

const MAX_ATTACHMENTS = 10
type FloatAttachment = UploadedAttachment & { previewUrl?: string }

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
  const [showSessions, setShowSessions] = useState(false)
  const [attachments, setAttachments] = useState<FloatAttachment[]>([])
  const [uploading, setUploading] = useState(0)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)

  // 在会话页时不渲染（全屏页已在），未弹出或引擎未就绪也不渲染
  if (!floating || !chat || location.pathname === CHAT_ROUTE) return null

  const engineLabel = chat.currentEngine === 'codex' ? 'Codex' : 'Claude'

  // 权限/提问弹框：悬浮态下也由本组件渲染（ChatPage 已卸载），否则用户无从作答。
  // 全屏 fixed 模态，独立于浮窗本体与最小化态——有未决决策必须能立刻处理。
  const pending = chat.pending
  const dialogs = (
    <>
      {pending?.kind === 'permission' && (
        <PermissionDialog
          toolName={pending.toolName}
          input={pending.input}
          onAllow={() => chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'allow' })}
          onDeny={() => chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'deny' })}
        />
      )}
      {pending?.kind === 'question' && (
        <QuestionDialog
          questions={pending.questions}
          onCancel={() => chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'deny' })}
          onSubmit={answers => chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'allow', answers })}
        />
      )}
    </>
  )

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

  const uploadFiles = async (files: FileList | null) => {
    if (!files || !chat.sessionId) return
    const room = MAX_ATTACHMENTS - attachments.length - uploading
    const sid = chat.sessionId
    for (const f of Array.from(files).slice(0, Math.max(0, room))) {
      setUploading(n => n + 1)
      try {
        const att = await uploadAttachment(sid, f)
        const previewUrl = f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined
        setAttachments(prev => [...prev, { ...att, previewUrl }])
      } catch (e) {
        console.error('[claude-chat] 悬浮窗附件上传失败', e)
      } finally {
        setUploading(n => n - 1)
      }
    }
  }

  // 粘贴：剪贴板含文件（如截图）当附件上传，纯文本照常粘贴
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files
    if (files && files.length > 0) {
      e.preventDefault()
      void uploadFiles(files)
    }
  }

  const submit = () => {
    const t = draft.trim()
    const hasAtt = attachments.length > 0
    if ((!t && !hasAtt) || chat.running) return
    chat.send(t, hasAtt ? attachments.map(a => ({ name: a.name, path: a.path })) : undefined)
    attachments.forEach(a => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl) })
    setDraft('')
    setAttachments([])
  }

  // 最小化：缩成可点击的小气泡（仍渲染弹框，未决决策不被吞）
  if (minimized) {
    return (
      <>
        <button
          type="button"
          onClick={() => setMinimized(false)}
          aria-label="展开 Vibe Coding 悬浮窗"
          className="fixed z-50 flex size-12 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-lg"
          style={{ left: pos.x, top: pos.y }}
        >
          <MessageSquare className="size-5" />
          {(chat.running || pending) && <span className="absolute right-0 top-0 size-3 animate-pulse rounded-full bg-amber-400" />}
        </button>
        {dialogs}
      </>
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
        <span className="rounded bg-[var(--color-background)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)]">{engineLabel}</span>
        <span className="text-xs text-[var(--color-muted-foreground)]">{chat.running ? `${engineLabel} 思考中…` : ''}</span>
        <div className="ml-auto flex gap-0.5">
          <button type="button" onClick={() => { chat.open(''); setShowSessions(false) }} aria-label="新建会话" title="新建会话（home 目录）"
            className="rounded p-1 hover:bg-[var(--color-background)]">
            <Plus className="size-4" />
          </button>
          <button type="button" onClick={() => setShowSessions(s => !s)} aria-label="会话列表" title="切换会话"
            className={`rounded p-1 hover:bg-[var(--color-background)] ${showSessions ? 'bg-[var(--color-background)]' : ''}`}>
            <List className="size-4" />
          </button>
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

      {/* 会话列表（切换/续跑）↔ 消息流，二选一 */}
      {showSessions ? (
        <div className="flex-1 overflow-y-auto">
          <SessionList
            currentSessionId={chat.sessionId}
            onSwitch={id => { chat.switchTo(id); setShowSessions(false) }}
          />
        </div>
      ) : (
        <MessageList items={chat.items} running={chat.running} onFork={chat.forkSession} engineLabel={engineLabel} />
      )}

      {/* 精简输入区（会话列表展开时隐藏） */}
      {!showSessions && (
      <div className="border-t">
        {(attachments.length > 0 || uploading > 0) && (
          <AttachmentChips
            items={attachments}
            uploading={uploading}
            onRemove={id => setAttachments(prev => {
              const t = prev.find(a => a.id === id)
              if (t?.previewUrl) URL.revokeObjectURL(t.previewUrl)
              return prev.filter(a => a.id !== id)
            })}
          />
        )}
        <div className="flex items-end gap-2 p-2">
          <textarea
            className="max-h-24 min-h-[2.25rem] flex-1 resize-none rounded-lg border bg-[var(--color-background)] px-2 py-1.5 text-sm"
            placeholder="发消息 / 粘贴图片…（Shift+Enter 发送）"
            rows={1}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onPaste={onPaste}
            onKeyDown={e => { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); submit() } }}
          />
          {chat.running ? (
            <button type="button" onClick={chat.interrupt} aria-label="中断"
              className="rounded-lg border px-3 py-2 text-sm">中断</button>
          ) : (
            <button type="button" onClick={submit} disabled={!draft.trim() && attachments.length === 0} aria-label="发送"
              className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-[var(--color-primary-foreground)] disabled:opacity-50">
              <Send className="size-4" />
            </button>
          )}
        </div>
      </div>
      )}
      {dialogs}
    </div>
  )
}
