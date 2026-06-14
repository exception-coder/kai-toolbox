import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, List, Loader2, Maximize2, MessageSquare, Minus, Plus, Send, Shield, ShieldCheck, X } from 'lucide-react'
import { CHAT_ROUTE, useChatRuntime } from '../runtime/ChatRuntimeContext'
import { MessageList } from './MessageList'
import { SessionList } from './SessionList'
import { PermissionDialog } from './PermissionDialog'
import { QuestionDialog } from './QuestionDialog'
import { AttachmentChips } from './AttachmentChips'
import { VoiceInputButton } from './VoiceInputButton'
import { listSessions, uploadAttachment, type UploadedAttachment } from '../api'
import type { ChatItem, Engine, PermissionMode } from '../types'

const MAX_ATTACHMENTS = 10
const MIN_MARGIN = 8
const MIN_W = 280
const MIN_H = 320
const BUBBLE = 48
const AUTO_APPROVE_KEY = 'kai-toolbox:auto-approve-permission'
type FloatAttachment = UploadedAttachment & { previewUrl?: string }

/** 权限模式循环顺序与中文标签（紧凑切换用，复刻 Shift+Tab 体验）。 */
const MODE_ORDER: PermissionMode[] = ['default', 'acceptEdits', 'plan', 'bypassPermissions']
const MODE_LABELS: Record<PermissionMode, string> = {
  default: '默认',
  acceptEdits: '自动接受',
  plan: '计划',
  bypassPermissions: '全自动',
}

function engineName(e: Engine): string {
  return e === 'codex' ? 'Codex' : e === 'gemini' ? 'Gemini' : 'Claude'
}

/** 由会话状态推导「进度文案 + 是否活跃」：待确认 / 思考中 / 执行中 / 出错 / 空闲。 */
function deriveStatus(items: ChatItem[], running: boolean, hasPermission: boolean, hasQuestion: boolean): { status: string; active: boolean } {
  const last = items[items.length - 1]
  if (hasPermission) return { status: '待确认权限', active: true }
  if (hasQuestion) return { status: '待回答提问', active: true }
  if (running) return { status: last?.kind === 'tool' ? '执行中…' : '思考中…', active: true }
  if (last?.kind === 'error') return { status: '出错', active: false }
  return { status: '空闲', active: false }
}

/**
 * 跨路由常驻的可拖拽 / 可调大小悬浮对话窗。仅在「已弹出 + 引擎已激活 + 当前不在会话页」时渲染，
 * 避免与全屏会话页双份 UI。操作的是 Context 里的同一聊天实例（同一 WS、同一会话）。
 */
export function FloatingChatWindow() {
  const { chat, floating, setFloating, minimized, setMinimized, pos, setPos, size, setSize } = useChatRuntime()
  const location = useLocation()
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const [showSessions, setShowSessions] = useState(false)
  // 迷你版（默认）：只显示进度状态 + 语音/输入/发送，不铺消息流；点切换看完整对话
  const [compact, setCompact] = useState(true)
  const [attachments, setAttachments] = useState<FloatAttachment[]>([])
  const [uploading, setUploading] = useState(0)
  const [autoApprove, setAutoApprove] = useState(() => localStorage.getItem(AUTO_APPROVE_KEY) === '1')
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const bubbleRef = useRef<{ dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null)
  const autoApprovedRef = useRef<string | null>(null)

  // 顶栏会话别名（与会话列表共用同一 query 缓存）
  const { data: sessions = [] } = useQuery({
    queryKey: ['claude-chat-sessions'],
    queryFn: listSessions,
    enabled: floating,
    staleTime: 5000,
  })
  const currentTitle = sessions.find(s => s.id === chat?.sessionId)?.title?.trim()
  const headerTitle = currentTitle || 'Vibe Coding'

  // 全自动·弹窗自动允许：浮窗态下 ChatPage 已卸载，自动放行 effect 必须在本组件跑。
  useEffect(() => {
    if (!chat || chat.mode !== 'bypassPermissions' || !autoApprove) return
    const p = chat.pending
    if (p?.kind !== 'permission') return
    if (autoApprovedRef.current === p.reqId) return
    autoApprovedRef.current = p.reqId
    chat.decide({ type: 'decision', reqId: p.reqId, behavior: 'allow' })
  }, [chat, autoApprove])

  // 在会话页时不渲染（全屏页已在），未弹出或引擎未就绪也不渲染
  if (!floating || !chat || location.pathname === CHAT_ROUTE) return null

  const engineLabel = engineName(chat.currentEngine)

  const toggleAutoApprove = () => setAutoApprove(v => {
    const nv = !v
    localStorage.setItem(AUTO_APPROVE_KEY, nv ? '1' : '0')
    return nv
  })

  // 点击循环切换权限模式（下一轮生效，与全屏 ModeSwitch 同语义）
  const cycleMode = () => {
    const i = MODE_ORDER.indexOf(chat.mode)
    chat.setMode(MODE_ORDER[(i + 1) % MODE_ORDER.length])
  }

  // 权限/提问弹框：悬浮态下也由本组件渲染（ChatPage 已卸载），否则用户无从作答。
  const pending = chat.pending
  const { status, active } = deriveStatus(chat.items, chat.running, pending?.kind === 'permission', pending?.kind === 'question')
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
    x: Math.max(MIN_MARGIN, Math.min(x, window.innerWidth - size.w - MIN_MARGIN)),
    y: Math.max(MIN_MARGIN, Math.min(y, window.innerHeight - 80)),
  })

  // 标题栏拖拽移动窗口
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, textarea, input, select')) return
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

  // 右下角拖拽调整大小
  const onResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    resizeRef.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onResizeMove = (e: React.PointerEvent) => {
    const r = resizeRef.current
    if (!r) return
    const w = Math.max(MIN_W, Math.min(r.w + (e.clientX - r.x), window.innerWidth - pos.x - MIN_MARGIN))
    const h = Math.max(MIN_H, Math.min(r.h + (e.clientY - r.y), window.innerHeight - pos.y - MIN_MARGIN))
    setSize({ w, h })
  }
  const onResizeUp = (e: React.PointerEvent) => {
    resizeRef.current = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  }

  // 最小化气泡拖拽（拖动则移动，未拖动视为点击展开）
  const onBubbleDown = (e: React.PointerEvent) => {
    bubbleRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, sx: e.clientX, sy: e.clientY, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onBubbleMove = (e: React.PointerEvent) => {
    const b = bubbleRef.current
    if (!b) return
    if (Math.abs(e.clientX - b.sx) > 3 || Math.abs(e.clientY - b.sy) > 3) b.moved = true
    setPos({
      x: Math.max(0, Math.min(e.clientX - b.dx, window.innerWidth - BUBBLE)),
      y: Math.max(0, Math.min(e.clientY - b.dy, window.innerHeight - BUBBLE)),
    })
  }
  const onBubbleUp = (e: React.PointerEvent) => {
    const b = bubbleRef.current
    bubbleRef.current = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    if (b && !b.moved) setMinimized(false)
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

  // 最小化：缩成「状态板」——不显示聊天内容，只显示进度（思考中/执行中/待确认/空闲）+ 会话别名。
  // 仍可拖动 / 点击展开；有未决决策仍渲染弹框。
  if (minimized) {
    return (
      <>
        <button
          type="button"
          onPointerDown={onBubbleDown}
          onPointerMove={onBubbleMove}
          onPointerUp={onBubbleUp}
          aria-label={`${headerTitle} ${status}，点击展开`}
          title={`${headerTitle} · ${status}（拖动移动，点击展开）`}
          className="fixed z-50 flex max-w-[72vw] cursor-move touch-none items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-background)] py-1.5 pl-2 pr-3.5 text-left shadow-lg"
          style={{ left: pos.x, top: pos.y }}
        >
          <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${active
            ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
            : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'}`}>
            {active ? <Loader2 className="size-4 animate-spin" /> : <MessageSquare className="size-4" />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium leading-tight">{headerTitle}</span>
            <span className={`block truncate text-[11px] leading-tight ${pending
              ? 'font-medium text-amber-600 dark:text-amber-400'
              : 'text-[var(--color-muted-foreground)]'}`}>
              {engineLabel} · {status}
            </span>
          </span>
        </button>
        {dialogs}
      </>
    )
  }

  const autoHeight = compact && !showSessions // 迷你态：高度随内容自适应（不铺消息流）
  return (
    <div
      className="fixed z-50 flex flex-col overflow-hidden rounded-xl border bg-[var(--color-background)] shadow-2xl"
      style={{ left: pos.x, top: pos.y, width: size.w, height: autoHeight ? undefined : size.h, maxHeight: autoHeight ? '70vh' : undefined }}
    >
      {/* 标题栏 = 拖拽手柄 */}
      <header
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex cursor-move touch-none items-center gap-2 border-b bg-[var(--color-muted)] px-3 py-2 select-none"
      >
        <MessageSquare className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={headerTitle}>{headerTitle}</span>
        <span className="shrink-0 rounded bg-[var(--color-background)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)]">{engineLabel}</span>
        <div className="flex shrink-0 gap-0.5">
          <button type="button" onClick={() => { chat.open(''); setShowSessions(false) }} aria-label="新建会话" title="新建会话（home 目录）"
            className="rounded p-1 hover:bg-[var(--color-background)]">
            <Plus className="size-4" />
          </button>
          <button type="button" onClick={() => setShowSessions(s => !s)} aria-label="会话列表" title="切换会话"
            className={`rounded p-1 hover:bg-[var(--color-background)] ${showSessions ? 'bg-[var(--color-background)]' : ''}`}>
            <List className="size-4" />
          </button>
          {!showSessions && (
            <button type="button" onClick={() => setCompact(c => !c)}
              aria-label={compact ? '展开完整对话' : '收起为迷你'} title={compact ? '展开看完整对话' : '收起为迷你（只看进度）'}
              className="rounded p-1 hover:bg-[var(--color-background)]">
              {compact ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
            </button>
          )}
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

      {/* 权限模式切换 + 弹窗自动允许（会话列表展开时隐藏） */}
      {!showSessions && (
        <div className="flex items-center gap-2 border-b px-2 py-1.5">
          <button
            type="button"
            onClick={cycleMode}
            title="点击切换权限模式：默认 → 自动接受 → 计划 → 全自动（下一轮生效）"
            className={`flex shrink-0 items-center gap-1 rounded border px-1.5 py-1 text-[11px] ${chat.mode === 'bypassPermissions'
              ? 'border-red-500 text-red-600 dark:text-red-400'
              : 'text-[var(--color-muted-foreground)]'}`}
          >
            <Shield className="size-3.5" /> 权限：{MODE_LABELS[chat.mode]}
          </button>
          {chat.mode === 'bypassPermissions' && (
            <button
              type="button"
              onClick={toggleAutoApprove}
              title="全自动下：弹出的权限框自动点「允许」（仅权限框，提问不自动应答）"
              className={`flex shrink-0 items-center gap-1 rounded border px-1.5 py-1 text-[11px] ${autoApprove
                ? 'border-red-500 text-red-600 dark:text-red-400'
                : 'text-[var(--color-muted-foreground)]'}`}
            >
              <ShieldCheck className="size-3.5" /> 自动允许·{autoApprove ? '开' : '关'}
            </button>
          )}
        </div>
      )}

      {/* 会话列表 / 迷你状态板 / 完整消息流，三选一 */}
      {showSessions ? (
        <div className="flex-1 overflow-y-auto">
          <SessionList
            currentSessionId={chat.sessionId}
            onSwitch={id => { chat.switchTo(id); setShowSessions(false) }}
          />
        </div>
      ) : compact ? (
        // 迷你版：不铺消息，只显示当前进度
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-6 text-center">
          <span className={`flex size-12 items-center justify-center rounded-full ${active
            ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
            : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'}`}>
            {active ? <Loader2 className="size-6 animate-spin" /> : <MessageSquare className="size-6" />}
          </span>
          <span className={`text-sm ${pending ? 'font-medium text-amber-600 dark:text-amber-400' : ''}`}>{status}</span>
          <span className="text-[11px] text-[var(--color-muted-foreground)]">点 ⌄ 看完整对话，或 ⤢ 全屏</span>
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
          <VoiceInputButton
            disabled={chat.running}
            onText={t => setDraft(d => (d.trim() ? `${d} ${t}` : t))}
          />
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

      {/* 右下角缩放手柄（仅完整态，迷你态高度自适应无需缩放） */}
      {!autoHeight && (
      <div
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        title="拖拽调整大小"
        className="absolute bottom-0 right-0 z-10 size-4 cursor-nwse-resize touch-none"
      >
        <svg viewBox="0 0 10 10" className="absolute bottom-[3px] right-[3px] size-2.5 text-[var(--color-muted-foreground)]">
          <path d="M9 1 L1 9 M9 5 L5 9" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
      </div>
      )}

      {dialogs}
    </div>
  )
}
