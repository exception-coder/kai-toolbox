import {
  useEffect, useRef, useState,
  type ClipboardEvent as ReactClipboardEvent,
} from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Archive, Loader2, MessagesSquare, Paperclip, Send, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { useChatRuntime } from '@/features/claude-chat/runtime/ChatRuntimeContext'
import type { ChatItem } from '@/features/claude-chat/types'
import { submitFeedback, uploadConsultAttachment } from '../api'

type Att = { name: string; path: string; mime?: string | null; url?: string }
type Rating = 'GOOD' | 'BAD'

const BAD_CATEGORIES = ['答非所问', '信息有误', '不够具体', '入口/步骤不对', '其他']

interface Props {
  consultId: string
  systemLabel: string
  roleLabel: string
  cwd: string
  onUploaded?: (name: string, path: string, mime?: string | null) => void
  onClose: () => void
  onArchive: () => void
  archiving: boolean
}

function renderMarkdown(text: string): string {
  try {
    return DOMPurify.sanitize(marked.parse(text, { async: false }) as string)
  } catch {
    return DOMPurify.sanitize(text)
  }
}

/**
 * 业务咨询独立会话面板：全息风，只做「发消息 / 附件 / 查看」。
 * 复用 claude-chat 运行时的同一 WS（chat.open/send/items）驱动，结果在本面板同步渲染，
 * 不弹 Vibe Coding 悬浮窗。会话以 bypassPermissions 打开（只读业务问答，自动放行工具），
 * 万一引擎发起提问/权限，给一个「在悬浮窗处理」的兜底入口。
 */
export function ConsultConversation({ consultId, systemLabel, roleLabel, cwd, onUploaded, onClose, onArchive, archiving }: Props) {
  const { chat, setFloating, setMinimized } = useChatRuntime()
  const [text, setText] = useState('')
  const [atts, setAtts] = useState<Att[]>([])
  const [uploading, setUploading] = useState(0)
  const [ratings, setRatings] = useState<Map<number, Rating>>(new Map())
  const [badDialog, setBadDialog] = useState<number | null>(null) // 打开不满意弹框的 turnIndex
  const fileRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const rateGood = (turnIndex: number) => {
    setRatings((prev) => new Map(prev).set(turnIndex, 'GOOD'))
    submitFeedback(consultId, turnIndex, { rating: 'GOOD' }).catch(() => {})
  }
  const submitBad = (turnIndex: number, category: string, reason: string, correctAnswer: string) => {
    setRatings((prev) => new Map(prev).set(turnIndex, 'BAD'))
    setBadDialog(null)
    submitFeedback(consultId, turnIndex, {
      rating: 'BAD',
      category,
      reason: reason.trim() || null,
      correctAnswer: correctAnswer.trim() || null,
    }).catch(() => {})
  }

  const items = chat?.items ?? []
  const running = !!chat?.running
  const pending = chat?.pending

  // 新消息 / 思考状态变化时滚到底
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [items.length, running])

  const MAX_ATT = 10
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const room = MAX_ATT - atts.length - uploading
    for (const f of Array.from(files).slice(0, Math.max(0, room))) {
      setUploading((n) => n + 1)
      try {
        const up = await uploadConsultAttachment(f, cwd || undefined)
        onUploaded?.(up.name, up.path, up.mime)
        const url = f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined
        setAtts((prev) => [...prev, { name: up.name, path: up.path, mime: up.mime, url }])
      } catch (e) {
        console.error('[fore-consult] 附件上传失败', e)
      } finally {
        setUploading((n) => n - 1)
      }
    }
    if (fileRef.current) fileRef.current.value = ''
  }
  const onPaste = (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files
    if (files && files.length > 0) {
      e.preventDefault()
      void handleFiles(files)
    }
  }
  const removeAtt = (path: string) => {
    setAtts((prev) => {
      const hit = prev.find((a) => a.path === path)
      if (hit?.url) URL.revokeObjectURL(hit.url)
      return prev.filter((a) => a.path !== path)
    })
  }

  const canSend = !!chat && (!!text.trim() || atts.length > 0) && uploading === 0
  const send = () => {
    if (!chat || !canSend) return
    const sa = atts.length ? atts.map((a) => ({ name: a.name, path: a.path, mime: a.mime ?? undefined, url: a.url })) : undefined
    if (running) chat.enqueue(text, sa)
    else chat.send(text, sa)
    setText('')
    setAtts([])
  }

  return (
    <div className="absolute inset-0 z-30" onClick={onClose}>
      <div
        className="fc-console absolute inset-y-0 left-0 flex w-[min(520px,94vw)] flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fc-console-scan" />

        {/* 头部 */}
        <div className="flex items-center justify-between gap-3 border-b border-indigo-300/12 p-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <MessagesSquare className="size-4 shrink-0 text-sky-300" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] text-sky-300/70">Consult Session</div>
              <h2 className="truncate text-sm font-semibold text-white">
                {systemLabel} <span className="ml-1 text-[11px] font-normal text-indigo-200/50">· {roleLabel}</span>
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onArchive}
              disabled={archiving}
              className="flex items-center gap-1 rounded-lg border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-200/90 transition-colors hover:bg-emerald-400/20 disabled:opacity-50"
              title="结束并归档本次咨询"
            >
              {archiving ? <Loader2 className="size-3 animate-spin" /> : <Archive className="size-3" />}
              结束归档
            </button>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-indigo-200/70 hover:bg-white/10" aria-label="收起">
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* 待确认兜底：正常 bypass 不会触发；若引擎提问/要权限，引导去悬浮窗处理 */}
        {pending && (
          <div className="flex items-center justify-between gap-2 border-b border-amber-300/20 bg-amber-400/10 px-4 py-2 text-[11px] text-amber-100">
            <span>AI 需要你确认一步操作</span>
            <button
              type="button"
              onClick={() => { setFloating(true); setMinimized(false) }}
              className="rounded-md bg-amber-400/80 px-2 py-0.5 font-medium text-amber-950 hover:bg-amber-300"
            >
              在悬浮窗处理
            </button>
          </div>
        )}

        {/* 消息流 */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {items.length === 0 && !running && (
            <p className="pt-8 text-center text-sm text-indigo-200/40">正在接入 Forge…</p>
          )}
          {(() => {
            let userCount = 0
            return items.map((it, idx) => {
              if (it.kind === 'user') userCount += 1
              const turnIdx = userCount
              const next = items[idx + 1]
              const showRating =
                it.kind === 'assistant' && it.text.trim().length > 0 && (!next || next.kind === 'user') && !running
              return (
                <div key={it.id} className="space-y-1.5">
                  <MessageRow item={it} />
                  {showRating && (
                    <RatingRow rating={ratings.get(turnIdx)} onGood={() => rateGood(turnIdx)} onBad={() => setBadDialog(turnIdx)} />
                  )}
                </div>
              )
            })
          })()}
          {running && (
            <div className="flex items-center gap-2 text-xs text-indigo-200/60">
              <span className="fc-thinking-dot">●</span>
              <span className="fc-thinking-dot" style={{ animationDelay: '0.2s' }}>●</span>
              <span className="fc-thinking-dot" style={{ animationDelay: '0.4s' }}>●</span>
              <span className="ml-1">AI 思考中…</span>
            </div>
          )}
        </div>

        {/* 组合器 */}
        <div className="border-t border-indigo-300/12 p-3">
          <div className="rounded-2xl border border-indigo-300/22 bg-white/[0.04] p-2 transition-colors focus-within:border-sky-300/50 focus-within:shadow-[0_0_0_2px_rgba(120,150,255,0.2)]">
            {(atts.length > 0 || uploading > 0) && (
              <div className="mb-1.5 flex flex-wrap gap-2 px-1">
                {atts.map((a) => (
                  <div key={a.path} className="fc-attach-thumb relative flex items-center gap-1.5 rounded-lg py-1 pl-1 pr-6 text-[11px] text-indigo-100/85">
                    {a.url ? <img src={a.url} alt={a.name} className="size-7 rounded object-cover" /> : <span className="flex size-7 items-center justify-center rounded bg-white/5 text-sky-300/80">📄</span>}
                    <span className="max-w-[120px] truncate">{a.name}</span>
                    <button type="button" onClick={() => removeAtt(a.path)} className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-indigo-200/60 hover:bg-white/10 hover:text-white" aria-label="移除">
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                {uploading > 0 && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-indigo-300/20 px-2 py-1.5 text-[11px] text-indigo-200/60">
                    <Loader2 className="size-3.5 animate-spin" /> 上传中…
                  </div>
                )}
              </div>
            )}
            <textarea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={onPaste}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="继续追问…（Enter 发送 / Shift+Enter 换行，可粘贴或上传附件）"
              className="w-full resize-none bg-transparent px-2 py-1.5 text-sm text-[#e8ecff] placeholder:text-indigo-200/35 focus:outline-none"
            />
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={atts.length + uploading >= MAX_ATT}
                className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-indigo-200/60 transition-colors hover:bg-white/10 hover:text-indigo-100 disabled:opacity-40"
                title="上传附件：图片/Excel/Word/Markdown/PDF"
              >
                <Paperclip className="size-3.5" /> 附件
              </button>
              <button
                type="button"
                onClick={send}
                disabled={!canSend}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-400 to-indigo-500 px-4 py-1.5 text-sm font-medium text-white shadow-[0_8px_30px_-8px_rgba(99,102,241,0.8)] transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="size-4" /> 发送
              </button>
            </div>
          </div>
        </div>

        {badDialog !== null && (
          <BadFeedbackDialog onCancel={() => setBadDialog(null)} onSubmit={(c, r, co) => submitBad(badDialog, c, r, co)} />
        )}
      </div>
    </div>
  )
}

function RatingRow({ rating, onGood, onBad }: { rating?: Rating; onGood: () => void; onBad: () => void }) {
  return (
    <div className="flex items-center gap-2 pl-1 pt-0.5">
      <span className="text-[10px] text-indigo-200/35">这条回答满意吗？</span>
      <button
        type="button"
        onClick={onGood}
        className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition-colors ${rating === 'GOOD' ? 'bg-emerald-400/20 text-emerald-200' : 'text-indigo-200/55 hover:bg-white/10'}`}
      >
        <ThumbsUp className="size-3" /> 有帮助
      </button>
      <button
        type="button"
        onClick={onBad}
        className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition-colors ${rating === 'BAD' ? 'bg-red-400/20 text-red-200' : 'text-indigo-200/55 hover:bg-white/10'}`}
      >
        <ThumbsDown className="size-3" /> 不满意
      </button>
      {rating && <span className="text-[10px] text-indigo-200/30">已反馈，谢谢</span>}
    </div>
  )
}

function BadFeedbackDialog({ onSubmit, onCancel }: { onSubmit: (category: string, reason: string, correct: string) => void; onCancel: () => void }) {
  const [category, setCategory] = useState(BAD_CATEGORIES[0])
  const [reason, setReason] = useState('')
  const [correct, setCorrect] = useState('')
  return (
    <div className="fc-backdrop absolute inset-0 z-40 flex items-center justify-center p-5" onClick={onCancel}>
      <div className="fc-panel w-full max-w-md rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ThumbsDown className="size-4 text-red-300" /> 反馈这条回答的问题
          </h3>
          <button type="button" onClick={onCancel} className="rounded-lg p-1.5 text-indigo-200/70 hover:bg-white/10" aria-label="关闭">
            <X className="size-4" />
          </button>
        </div>
        <div className="mb-3">
          <div className="mb-1.5 text-[11px] text-indigo-200/55">问题类型</div>
          <div className="flex flex-wrap gap-1.5">
            {BAD_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  category === c ? 'border-sky-300/60 bg-sky-400/20 text-sky-100' : 'border-indigo-300/22 bg-white/[0.04] text-indigo-100/70 hover:bg-white/10'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-3">
          <div className="mb-1.5 text-[11px] text-indigo-200/55">具体原因</div>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="哪里不对 / 你期望的是什么…" className="fc-glass-input w-full resize-none rounded-lg px-2.5 py-1.5 text-sm" />
        </div>
        <div className="mb-4">
          <div className="mb-1.5 text-[11px] text-indigo-200/55">正确答案（可选，若你知道）</div>
          <textarea rows={2} value={correct} onChange={(e) => setCorrect(e.target.value)} placeholder="填写正确的操作/结论，帮助我们改进知识库" className="fc-glass-input w-full resize-none rounded-lg px-2.5 py-1.5 text-sm" />
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2 text-sm text-indigo-200/70 hover:bg-white/5">
            取消
          </button>
          <button
            type="button"
            onClick={() => onSubmit(category, reason, correct)}
            className="rounded-xl bg-gradient-to-r from-sky-400 to-indigo-500 px-4 py-2 text-sm font-medium text-white shadow-[0_8px_30px_-8px_rgba(99,102,241,0.8)] transition-transform hover:scale-[1.03]"
          >
            提交反馈
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageRow({ item }: { item: ChatItem }) {
  if (item.kind === 'user') {
    const shown = item.displayText ?? item.text
    return (
      <div className="flex flex-col items-end gap-1">
        {item.attachments && item.attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {item.attachments.map((a, i) =>
              a.url ? (
                <img key={i} src={a.url} alt={a.name} className="size-16 rounded-lg border border-indigo-300/25 object-cover" />
              ) : (
                <span key={i} className="rounded-lg border border-indigo-300/25 bg-white/5 px-2 py-1 text-[11px] text-indigo-100/80">📄 {a.name}</span>
              ),
            )}
          </div>
        )}
        {shown.trim() && (
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm border border-sky-300/25 bg-sky-400/15 px-3 py-2 text-sm text-sky-50">
            {shown}
          </div>
        )}
      </div>
    )
  }
  if (item.kind === 'assistant') {
    if (!item.text.trim()) return null
    return (
      <div className="max-w-[92%] rounded-2xl rounded-tl-sm border border-indigo-300/15 bg-white/[0.04] px-3.5 py-2.5">
        <div className="fc-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(item.text) }} />
      </div>
    )
  }
  // 本模块聊天框不展示工具调用信息（item.kind === 'tool' 直接忽略）。
  if (item.kind === 'error') {
    return (
      <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-200">
        出错：{item.message}
      </div>
    )
  }
  return null
}
