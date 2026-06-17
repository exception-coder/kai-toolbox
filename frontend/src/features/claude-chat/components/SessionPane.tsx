import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Paperclip, Send, ShieldCheck, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useClaudeChatSocket } from '../hooks/useClaudeChatSocket'
import { listSessions, uploadAttachment, type UploadedAttachment } from '../api'
import { ensureNotifyPermission } from '../browserNotify'
import { MessageList } from './MessageList'
import { PermissionDialog } from './PermissionDialog'
import { QuestionDialog } from './QuestionDialog'
import { ModeSwitch } from './ModeSwitch'
import { AttachmentChips } from './AttachmentChips'
import { VoiceInputButton } from './VoiceInputButton'
import { agentStatusMeta, deriveAgentStatus, engineName, type AgentStatus } from './chatStatus'

interface Props {
  /** 本块续接的会话 id。 */
  sessionId: string
  /** 该 Agent 的区分色（hex），用于块头染色。 */
  accent: string
  /** 上报本块业务状态，供分屏概览展示。 */
  onStatus: (status: AgentStatus) => void
  /** 从分屏移除本块。 */
  onClose: () => void
}

/** 单条消息最多附件数，与单会话视图、后端约定一致。 */
const MAX_ATTACHMENTS = 10
/** 「弹窗自动允许」全局开关键，与单会话视图共用，多处同步。 */
const AUTO_APPROVE_KEY = 'kai-toolbox:auto-approve-permission'

type ChatAttachment = UploadedAttachment & { previewUrl?: string }

function shortCwd(cwd: string): string {
  const i = Math.max(cwd.lastIndexOf('/'), cwd.lastIndexOf('\\'))
  return i >= 0 && i < cwd.length - 1 ? cwd.slice(i + 1) : cwd
}

/**
 * 分屏中的单个 Agent 会话块：自带独立 WS（useClaudeChatSocket 自包含），挂载后续接指定会话，
 * 与其它块**同时并存可交互**（各自发消息/流式回复/图片上传/语音/权限·提问/弹窗自动允许）。
 * 块头按 Agent 区分色染色 + 状态点，报错时顶部红色状态条突出。
 */
export function SessionPane({ sessionId, accent, onStatus, onClose }: Props) {
  const chat = useClaudeChatSocket()
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [uploading, setUploading] = useState(0)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // 挂载（或 sessionId 变化）后续接一次该会话
  const switchedRef = useRef<string | null>(null)
  useEffect(() => {
    if (switchedRef.current === sessionId) return
    switchedRef.current = sessionId
    chat.switchTo(sessionId)
  }, [sessionId, chat])

  // 派生并上报业务状态（用 ref 持有 onStatus，避免父回调 identity 变化导致的重复触发）
  const status = deriveAgentStatus(chat.state, chat.running, chat.items, chat.errorMessage)
  const onStatusRef = useRef(onStatus)
  onStatusRef.current = onStatus
  useEffect(() => {
    onStatusRef.current({ kind: status.kind, errorText: status.errorText, count: status.count })
  }, [status.kind, status.errorText, status.count])

  // 标题取自会话列表缓存（与单会话视图共用同一 query 缓存）
  const { data: sessions = [] } = useQuery({ queryKey: ['claude-chat-sessions'], queryFn: listSessions, staleTime: 5000 })
  const meta = sessions.find(s => s.id === sessionId)
  const title = meta?.title?.trim() || (meta ? shortCwd(meta.cwd) : sessionId.slice(0, 8))

  // 弹窗自动允许：与单会话共用全局开关；监听 storage 让多块/单视图间同步
  const [autoApprove, setAutoApprove] = useState(() => localStorage.getItem(AUTO_APPROVE_KEY) === '1')
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === AUTO_APPROVE_KEY) setAutoApprove(e.newValue === '1') }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  const toggleAutoApprove = () => setAutoApprove(v => {
    const nv = !v
    try { localStorage.setItem(AUTO_APPROVE_KEY, nv ? '1' : '0') } catch { /* ignore */ }
    return nv
  })

  const pending = chat.pending
  // 全自动 + 开关开启时，自动放行本块的权限框（仅 permission；AskUserQuestion 提问不自动应答）
  const autoApprovedRef = useRef<string | null>(null)
  useEffect(() => {
    if (chat.mode !== 'bypassPermissions' || !autoApprove) return
    if (pending?.kind !== 'permission') return
    if (autoApprovedRef.current === pending.reqId) return
    autoApprovedRef.current = pending.reqId
    chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'allow' })
  }, [pending, autoApprove, chat])

  const handleFiles = async (files: FileList | null) => {
    if (!files || !chat.sessionId) return
    const room = MAX_ATTACHMENTS - attachments.length - uploading
    const take = Array.from(files).slice(0, Math.max(0, room))
    const sid = chat.sessionId
    for (const f of take) {
      setUploading(n => n + 1)
      try {
        const att = await uploadAttachment(sid, f)
        const previewUrl = f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined
        setAttachments(prev => [...prev, { ...att, previewUrl }])
      } catch (e) {
        console.error('[claude-chat] 附件上传失败', e)
      } finally {
        setUploading(n => n - 1)
      }
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files
    if (files && files.length > 0) {
      e.preventDefault()
      void handleFiles(files)
    }
  }

  const submit = () => {
    if (!chat.sessionId) return
    if (!draft.trim() && attachments.length === 0) return
    ensureNotifyPermission()
    chat.send(draft, attachments.map(a => ({ name: a.name, path: a.path })))
    attachments.forEach(a => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl) })
    setDraft('')
    setAttachments([])
    const el = taRef.current
    if (el) el.style.height = 'auto'
  }

  const sm = agentStatusMeta(status.kind)
  const atMax = attachments.length + uploading >= MAX_ATTACHMENTS

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-[var(--color-background)]">
      {/* 块头：左侧 Agent 区分色竖条 + 轻量染色背景 + 状态 + 关闭 */}
      <div
        className="flex items-center gap-2 border-b px-2.5 py-1.5"
        style={{ backgroundColor: `${accent}14`, borderLeft: `3px solid ${accent}` }}
      >
        <span className={`size-2.5 shrink-0 rounded-full ${sm.dot}${sm.pulse ? ' animate-pulse' : ''}`} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={meta?.cwd}>{title}</span>
        <span className="shrink-0 rounded bg-[var(--color-background)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)]">
          {engineName(chat.currentEngine)}
        </span>
        <span className={`shrink-0 text-xs font-medium ${sm.text}`}>{sm.label}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭此块"
          className="shrink-0 rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* 报错状态条：不让用户自己翻聊天记录 */}
      {status.kind === 'error' && status.errorText && (
        <div className="flex items-start gap-2 border-b border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 flex-1 break-words">{status.errorText}</span>
        </div>
      )}

      {/* 消息流：flex 列容器，MessageList 靠 flex-1 拿到有界高度并内部滚动 */}
      <div className="flex min-h-0 flex-1 flex-col">
        <MessageList
          items={chat.items}
          running={chat.running}
          onLoadEarlier={() => chat.loadHistory(false)}
          loadingEarlier={chat.historyLoading}
          exhausted={chat.historyExhausted}
          onFork={chat.forkSession}
          engineLabel={engineName(chat.currentEngine)}
        />
      </div>

      {/* 输入条：附件预览 + 模式/自动允许 + 附件/语音/输入/发送 */}
      <div className="border-t bg-[var(--color-muted)] px-2 py-1.5">
        <AttachmentChips
          items={attachments}
          uploading={uploading}
          onRemove={id => setAttachments(prev => {
            const t = prev.find(a => a.id === id)
            if (t?.previewUrl) URL.revokeObjectURL(t.previewUrl)
            return prev.filter(a => a.id !== id)
          })}
        />
        <div className="mb-1 flex items-center gap-1">
          <ModeSwitch mode={chat.mode} onChange={chat.setMode} />
          {chat.mode === 'bypassPermissions' && (
            <button
              type="button"
              onClick={toggleAutoApprove}
              title="全自动下：弹出的权限框自动点「允许」（仅权限框；AskUserQuestion 提问不自动应答）"
              aria-label="弹窗自动允许开关"
              className={'flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] '
                + (autoApprove
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'text-[var(--color-muted-foreground)]')}
            >
              <ShieldCheck className="size-3" /> 自动允许·{autoApprove ? '开' : '关'}
            </button>
          )}
        </div>
        <div className="flex items-end gap-1">
          {/* 附件：label 包 input，保留原生触发（移动端 WebView 不丢手势） */}
          <label
            aria-label="添加附件"
            title="添加图片 / 文档"
            className={`flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-[var(--color-accent)]${atMax ? ' pointer-events-none opacity-50' : ''}`}
          >
            <input
              ref={fileRef}
              type="file"
              multiple
              className="sr-only"
              disabled={atMax}
              onChange={e => handleFiles(e.target.files)}
            />
            <Paperclip className="size-4 text-[var(--color-primary)]" />
          </label>
          <VoiceInputButton
            disabled={chat.running}
            onText={t => setDraft(d => d.trim() ? `${d} ${t}` : t)}
          />
          <textarea
            ref={taRef}
            value={draft}
            onChange={e => {
              setDraft(e.target.value)
              const el = e.target
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`
            }}
            onPaste={handlePaste}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!chat.running) submit() }
            }}
            rows={1}
            placeholder="发消息…（可粘贴图片）"
            className="max-h-[120px] min-h-[36px] flex-1 resize-none rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-sm"
          />
          {chat.running ? (
            <Button variant="outline" size="icon" onClick={chat.interrupt} aria-label="中断" className="shrink-0">
              <Square className="size-4" />
            </Button>
          ) : (
            <Button size="icon" onClick={submit} disabled={!draft.trim() && attachments.length === 0} aria-label="发送" className="shrink-0">
              <Send className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* 本块独立的权限 / 提问弹窗 */}
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
    </div>
  )
}
