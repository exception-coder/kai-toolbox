import {
  memo, useEffect, useMemo, useRef, useState,
  type ClipboardEvent as ReactClipboardEvent, type ReactNode,
} from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Archive, Bug, CheckCircle2, CircleDashed, Database, GitBranch, Loader2, MessagesSquare, Paperclip, Quote, Send, ShieldAlert, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import type { UseClaudeChatSocket } from '@/features/claude-chat/hooks/useClaudeChatSocket'
import type { ChatItem } from '@/features/claude-chat/types'
import { dispatchConsultQuestion, registerBug, submitFeedback, uploadConsultAttachment } from '../api'
import { buildConsultTurnAudits, type AuditEvidence, type AuditState, type ConsultTurnAudit } from '../consultAudit'

// AI 在回答里判定为缺陷时输出的机器可读块，前端解析登记并从展示中剥离。
const BUG_RE = /<<<BUG_REPORT>>>\s*([\s\S]*?)\s*<<<END_BUG_REPORT>>>/
interface ParsedBug {
  title?: string; type?: string; severity?: string; module?: string
  reproduce?: string; expected?: string; actual?: string; suspectArea?: string; confidence?: number
}
function extractBug(text: string): ParsedBug | null {
  const m = text.match(BUG_RE)
  if (!m) return null
  try {
    return JSON.parse(m[1].trim()) as ParsedBug
  } catch {
    return null
  }
}
function stripBug(text: string): string {
  return text.replace(BUG_RE, '').trim()
}
import { ImageLightbox } from './ImageLightbox'

type Att = { name: string; path: string; mime?: string | null; url?: string }
type Rating = 'GOOD' | 'BAD'

const BAD_CATEGORIES = ['答非所问', '信息有误', '不够具体', '入口/步骤不对', '其他']
const QUESTION_CLASSIFY_TIMEOUT_MS = 6_500

interface Props {
  chat: UseClaudeChatSocket
  consultId: string
  systemLabel: string
  roleLabel: string
  cwd: string
  onUploaded?: (name: string, path: string, mime?: string | null) => void
  onBugRegistered?: () => void
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
 * 业务咨询独立会话面板：玻璃侧边栏，只做「发消息 / 附件 / 查看」。
 * 复用 claude-chat 协议的业务咨询专用 WS（chat.open/send/items）驱动，结果在本面板同步渲染。
 * 会话从 consult 专用通道打开；服务端强制 consult-readonly，只允许读取与白名单 MCP。
 */
export function ConsultConversation({ chat, consultId, systemLabel, roleLabel, cwd, onUploaded, onBugRegistered, onClose, onArchive, archiving }: Props) {
  const [text, setText] = useState('')
  const [atts, setAtts] = useState<Att[]>([])
  const [uploading, setUploading] = useState(0)
  const [ratings, setRatings] = useState<Map<number, Rating>>(new Map())
  const [badDialog, setBadDialog] = useState<number | null>(null) // 打开不满意弹框的 turnIndex
  const [lightbox, setLightbox] = useState<string | null>(null) // 图片灯箱 src
  const [bugTurns, setBugTurns] = useState<Set<string>>(new Set()) // 已登记 BUG 的 assistant 消息 id
  const registeredRef = useRef<Set<string>>(new Set())
  const [classifying, setClassifying] = useState(false)
  const [newQuestionReason, setNewQuestionReason] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  // 引用某条消息：原文转 Markdown 引用块带进输入框，空一行让用户在下面接着追问。
  const quoteMessage = (raw: string) => {
    const MAX = 800
    const src = raw.length > MAX ? raw.slice(0, MAX).trimEnd() + ' …' : raw
    const block = src
      .split('\n')
      .map((l) => (l.trim() ? '> ' + l : '>'))
      .join('\n')
    setText((prev) => (prev.trim() ? prev.replace(/\n+$/, '') + '\n\n' : '') + block + '\n\n')
    setTimeout(() => {
      const el = textRef.current
      if (el) {
        el.focus()
        const len = el.value.length
        el.setSelectionRange(len, len)
        el.scrollTop = el.scrollHeight
      }
    }, 0)
  }

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
  // 立即反馈：只要最后一条是用户消息（已发出、还没等到回复），就显示"思考/接入中"，
  // 不必等 chat.running 变 true（引擎连接/开会话有延迟，否则会白等一段时间没反馈）。
  const lastItem = items[items.length - 1]
  const waiting = running || lastItem?.kind === 'user'
  const turnAudits = useMemo(() => buildConsultTurnAudits(items, running), [items, running])

  // 新消息 / 思考状态变化时滚到底
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [items.length, running])

  // 回答完成后：解析其中的 BUG 结构化块并自动登记（每条 assistant 只处理一次）。
  useEffect(() => {
    if (running) return
    items.forEach((it) => {
      if (it.kind !== 'assistant' || registeredRef.current.has(it.id)) return
      registeredRef.current.add(it.id)
      const bug = extractBug(it.text)
      if (!bug || !bug.title) return
      const idx = items.indexOf(it)
      let turnIndex = 0
      let question = ''
      for (let i = 0; i <= idx; i++) {
        const m = items[i]
        if (m.kind === 'user') {
          turnIndex++
          question = m.displayText ?? m.text
        }
      }
      registerBug({
        consultSessionId: consultId,
        turnIndex,
        title: bug.title,
        type: bug.type,
        severity: bug.severity,
        module: bug.module,
        reproduce: bug.reproduce,
        expected: bug.expected,
        actual: bug.actual,
        suspectArea: bug.suspectArea,
        confidence: typeof bug.confidence === 'number' ? bug.confidence : undefined,
        question,
        answer: stripBug(it.text),
      })
        .then(() => {
          setBugTurns((p) => new Set(p).add(it.id))
          onBugRegistered?.()
        })
        .catch(() => {})
    })
  }, [items, running, consultId, onBugRegistered])

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

  const hasSendableContent = !!chat && (!!text.trim() || atts.length > 0) && uploading === 0
  const canSend = hasSendableContent && !classifying
  const dispatchMessage = (
    message: string,
    attachments: Array<{ name: string; path: string; mime?: string; url?: string }> | undefined,
    shouldQueue: boolean,
    developerInstructions?: string,
  ) => {
    if (shouldQueue) chat.enqueue(message, attachments, undefined, developerInstructions)
    else chat.send(message, attachments, undefined, developerInstructions)
    setText('')
    setAtts([])
  }
  const sendCurrentAsFollowUp = async () => {
    if (!hasSendableContent) return
    const message = text
    const attachments = atts.length
      ? atts.map((a) => ({ name: a.name, path: a.path, mime: a.mime ?? undefined, url: a.url }))
      : undefined
    const firstQuestion = items.find((item) => item.kind === 'user')
    setClassifying(true)
    try {
      const result = await dispatchConsultQuestion(
        consultId,
        message.trim() || '补充附件',
        firstQuestion?.kind === 'user' ? firstQuestion.displayText ?? firstQuestion.text : undefined,
        true,
      )
      dispatchMessage(message, attachments, running, result.prompt ?? undefined)
    } catch {
      dispatchMessage(message, attachments, running)
    } finally {
      setClassifying(false)
    }
  }
  const send = async () => {
    if (!chat || !canSend) return
    // 分类是异步的，先快照本次点击发送的内容，避免等待期间输入状态变化导致消息丢失或错发。
    const message = text
    const attachments = atts.length
      ? atts.map((a) => ({ name: a.name, path: a.path, mime: a.mime ?? undefined, url: a.url }))
      : undefined
    const shouldQueue = running
    const firstQuestion = items.find((item) => item.kind === 'user')
    if (!firstQuestion || firstQuestion.kind !== 'user') {
      dispatchMessage(message, attachments, shouldQueue)
      return
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), QUESTION_CLASSIFY_TIMEOUT_MS)
    setClassifying(true)
    try {
      const result = await dispatchConsultQuestion(
        consultId,
        message.trim() || '补充附件',
        firstQuestion.displayText ?? firstQuestion.text,
        false,
        controller.signal,
      )
      if (result.action === 'START_NEW_SESSION') {
        setNewQuestionReason(result.reason)
        return
      }
      dispatchMessage(result.prompt ?? message, attachments, shouldQueue, message)
    } catch {
      // 分类只是辅助拦截，超时、断网或服务异常都必须放行用户消息，不能卡在“识别中”。
      dispatchMessage(message, attachments, shouldQueue)
    } finally {
      window.clearTimeout(timeout)
      setClassifying(false)
    }
  }

  return (
    <div className="fc-conversation-layer absolute inset-0 z-30" onClick={onClose}>
      <div
        className="fc-console absolute inset-y-3 left-3 flex w-[min(520px,calc(100%-24px))] flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fc-console-scan" />

        {/* 头部 */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 p-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <MessagesSquare className="size-4 shrink-0 text-sky-600" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] text-sky-600/70">Consult Session</div>
              <h2 className="truncate text-sm font-semibold text-slate-900">
                {systemLabel} <span className="ml-1 text-[11px] font-normal text-slate-500">· {roleLabel}</span>
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                onArchive()
              }}
              disabled={archiving}
              className="flex min-w-[76px] items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50/80 px-2.5 py-1 text-[11px] text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-60"
              title="结束并归档本次咨询"
            >
              {archiving ? <Loader2 className="size-3 animate-spin" /> : <Archive className="size-3" />}
              {archiving ? '归档中…' : '结束归档'}
            </button>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900" aria-label="收起">
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* 正常 bypass 不会触发；异常出现待确认时留在咨询面板提示，避免跳入 ADMIN-only 悬浮窗。 */}
        {pending && (
          <div className="shrink-0 border-b border-amber-200 bg-amber-50/80 px-4 py-2 text-[11px] text-amber-700">
            AI 需要额外确认，请在输入框补充相关信息后重新发送；业务咨询不会跳转到管理员专用悬浮窗。
          </div>
        )}

        {/* 消息流 */}
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {items.length === 0 && !running && (
            <p className="pt-8 text-center text-sm text-slate-400">正在接入 Forge…</p>
          )}
          {(() => {
            let userCount = 0
            return items.map((it, idx) => {
              if (it.kind === 'user') userCount += 1
              const turnIdx = userCount
              const next = items[idx + 1]
              const showRating =
                it.kind === 'assistant' && it.text.trim().length > 0 && (!next || next.kind === 'user') && !running
              const quotable = it.kind === 'assistant' ? stripBug(it.text) : it.kind === 'user' ? it.displayText ?? it.text : ''
              return (
                <div key={it.id} className="group space-y-1.5">
                  <MessageRow item={it} onImageClick={setLightbox} />
                  {quotable.trim() && (
                    <div className={`flex opacity-0 transition-opacity group-hover:opacity-100 ${it.kind === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <button
                        type="button"
                        onClick={() => quoteMessage(quotable)}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        title="引用这条消息到输入框追问"
                      >
                        <Quote className="size-3" /> 引用
                      </button>
                    </div>
                  )}
                  {showRating && (
                    <>
                      {turnAudits.get(it.id) && <ConsultAuditRow audit={turnAudits.get(it.id)!} />}
                      <RatingRow rating={ratings.get(turnIdx)} onGood={() => rateGood(turnIdx)} onBad={() => setBadDialog(turnIdx)} />
                    </>
                  )}
                  {bugTurns.has(it.id) && (
                    <div className="flex items-center gap-1.5 pl-1 text-[11px] text-amber-700">
                      <Bug className="size-3" /> 已识别为缺陷并自动登记到 Bug 库
                    </div>
                  )}
                </div>
              )
            })
          })()}
          {waiting && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="fc-thinking-dot">●</span>
              <span className="fc-thinking-dot" style={{ animationDelay: '0.2s' }}>●</span>
              <span className="fc-thinking-dot" style={{ animationDelay: '0.4s' }}>●</span>
              <span className="ml-1">{running ? 'AI 思考中…' : '正在接入 Forge…'}</span>
            </div>
          )}
        </div>

        {/* 组合器 */}
        <div className="shrink-0 border-t border-slate-200/80 p-3">
          <div className="rounded-2xl border border-slate-200 bg-white/65 p-2 shadow-[0_10px_28px_-24px_rgba(15,23,42,0.3)] transition-colors focus-within:border-sky-300 focus-within:bg-white/85 focus-within:shadow-[0_0_0_3px_rgba(56,189,248,0.1)]">
            {(atts.length > 0 || uploading > 0) && (
              <div className="mb-1.5 flex max-h-20 flex-wrap gap-2 overflow-y-auto px-1">
                {atts.map((a) => (
                  <div key={a.path} className="fc-attach-thumb relative flex items-center gap-1.5 rounded-lg py-1 pl-1 pr-6 text-[11px] text-slate-600">
                    {a.url ? <img src={a.url} alt={a.name} onClick={() => setLightbox(a.url!)} className="size-7 cursor-zoom-in rounded object-cover" /> : <span className="flex size-7 items-center justify-center rounded bg-slate-100 text-sky-600/80">📄</span>}
                    <span className="max-w-[120px] truncate">{a.name}</span>
                    <button type="button" onClick={() => removeAtt(a.path)} className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900" aria-label="移除">
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                {uploading > 0 && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] text-slate-500">
                    <Loader2 className="size-3.5 animate-spin" /> 上传中…
                  </div>
                )}
              </div>
            )}
            <textarea
              ref={textRef}
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || !e.shiftKey || e.nativeEvent.isComposing) return
                e.preventDefault()
                void send()
              }}
              placeholder="继续追问…（Shift+Enter 发送 / Enter 换行，可粘贴或上传附件）"
              className="w-full resize-none bg-transparent px-2 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
            />
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={atts.length + uploading >= MAX_ATT}
                className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
                title="上传附件：图片/Excel/Word/Markdown/PDF"
              >
                <Paperclip className="size-3.5" /> 附件
              </button>
              <button
                type="button"
                onClick={() => void send()}
                disabled={!canSend}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-400 to-indigo-500 px-4 py-1.5 text-sm font-medium text-white shadow-[0_8px_30px_-8px_rgba(99,102,241,0.8)] transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {classifying ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {classifying ? '识别中…' : '发送'}
              </button>
            </div>
          </div>
        </div>

        {badDialog !== null && (
          <BadFeedbackDialog onCancel={() => setBadDialog(null)} onSubmit={(c, r, co) => submitBad(badDialog, c, r, co)} />
        )}
        {newQuestionReason !== null && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-200/55 p-5 backdrop-blur-md">
            <div className="w-full max-w-sm rounded-2xl border border-white/90 bg-white/90 p-5 shadow-2xl">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-700">
                <ShieldAlert className="size-4" /> 这可能是一个新问题
              </div>
              <p className="text-sm leading-6 text-slate-600">
                为便于按系统和问题独立归档、评测，请结束当前咨询，再选择所属系统开启新的业务会话。
              </p>
              <p className="mt-2 text-xs text-slate-400">识别依据：{newQuestionReason}</p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNewQuestionReason(null)
                    sendCurrentAsFollowUp()
                  }}
                  className="rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                >
                  仍作为追问
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewQuestionReason(null)
                    onArchive()
                  }}
                  className="rounded-xl bg-amber-400 px-3 py-2 text-sm font-medium text-amber-950 hover:bg-amber-300"
                >
                  结束当前咨询
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}

const AUDIT_TONE: Record<AuditState, string> = {
  running: 'border-sky-200 bg-sky-50 text-sky-700',
  pass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  idle: 'border-slate-200 bg-slate-50/80 text-slate-500',
  warn: 'border-amber-200 bg-amber-50 text-amber-700',
}

function ConsultAuditRow({ audit }: { audit: ConsultTurnAudit }) {
  return (
    <div className="flex flex-wrap gap-1.5 pl-1 pt-0.5">
      <AuditBadge
        icon={<GitBranch className="size-3" />}
        label={audit.domain.state === 'pass' ? `业务图 · ${audit.domain.evidence.length} 次` : audit.domain.state === 'running' ? '业务图 · 检查中' : '业务图 · 未查询'}
        state={audit.domain.state}
        evidence={audit.domain.evidence}
      />
      <AuditBadge
        icon={<GitBranch className="size-3" />}
        label={audit.graphify.state === 'pass' ? `代码图 · ${audit.graphify.evidence.length} 次` : audit.graphify.state === 'running' ? '代码图 · 检查中' : '代码图 · 未查询'}
        state={audit.graphify.state}
        evidence={audit.graphify.evidence}
      />
      <AuditBadge
        icon={audit.bug.state === 'warn' ? <Bug className="size-3" /> : <CheckCircle2 className="size-3" />}
        label={audit.bug.label}
        state={audit.bug.state}
      />
      <AuditBadge
        icon={audit.database.state === 'warn' ? <ShieldAlert className="size-3" /> : <Database className="size-3" />}
        label={audit.database.label}
        state={audit.database.state}
        evidence={audit.database.evidence}
      />
    </div>
  )
}

function AuditBadge({ icon, label, state, evidence = [] }: {
  icon: ReactNode
  label: string
  state: AuditState
  evidence?: AuditEvidence[]
}) {
  const details = evidence
    .map((entry) => [
      entry.toolName,
      entry.input ? `输入：${entry.input}` : '',
      entry.output ? `结果：${entry.output}` : '',
      entry.isError ? '调用失败' : '',
    ].filter(Boolean).join('\n'))
    .join('\n\n')
  const content = (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] ${AUDIT_TONE[state]}`}>
      {state === 'running' ? <CircleDashed className="size-3 animate-spin" /> : icon}
      {label}
    </span>
  )
  return details ? <details className="group/audit cursor-pointer" title="点击查看调用证据"><summary className="list-none">{content}</summary><pre className="mt-1 max-w-[460px] whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-900 p-2 text-[10px] leading-relaxed text-slate-200">{details}</pre></details> : content
}

function RatingRow({ rating, onGood, onBad }: { rating?: Rating; onGood: () => void; onBad: () => void }) {
  return (
    <div className="flex items-center gap-2 pl-1 pt-0.5">
      <span className="text-[10px] text-slate-400">这条回答满意吗？</span>
      <button
        type="button"
        onClick={onGood}
        className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition-colors ${rating === 'GOOD' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-100'}`}
      >
        <ThumbsUp className="size-3" /> 有帮助
      </button>
      <button
        type="button"
        onClick={onBad}
        className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition-colors ${rating === 'BAD' ? 'bg-red-50 text-red-700' : 'text-slate-500 hover:bg-slate-100'}`}
      >
        <ThumbsDown className="size-3" /> 不满意
      </button>
      {rating && <span className="text-[10px] text-slate-400">已反馈，谢谢</span>}
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
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ThumbsDown className="size-4 text-red-500" /> 反馈这条回答的问题
          </h3>
          <button type="button" onClick={onCancel} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900" aria-label="关闭">
            <X className="size-4" />
          </button>
        </div>
        <div className="mb-3">
          <div className="mb-1.5 text-[11px] text-slate-500">问题类型</div>
          <div className="flex flex-wrap gap-1.5">
            {BAD_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  category === c ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white/60 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-3">
          <div className="mb-1.5 text-[11px] text-slate-500">具体原因</div>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="哪里不对 / 你期望的是什么…" className="fc-glass-input w-full resize-none rounded-lg px-2.5 py-1.5 text-sm" />
        </div>
        <div className="mb-4">
          <div className="mb-1.5 text-[11px] text-slate-500">正确答案（可选，若你知道）</div>
          <textarea rows={2} value={correct} onChange={(e) => setCorrect(e.target.value)} placeholder="填写正确的操作/结论，帮助我们改进知识库" className="fc-glass-input w-full resize-none rounded-lg px-2.5 py-1.5 text-sm" />
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900">
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

const MessageRow = memo(function MessageRow({ item, onImageClick }: { item: ChatItem; onImageClick: (src: string) => void }) {
  const assistantHtml = useMemo(
    () => (item.kind === 'assistant' && item.text.trim() ? renderMarkdown(stripBug(item.text)) : ''),
    [item],
  )
  if (item.kind === 'user') {
    const shown = item.displayText ?? item.text
    return (
      <div className="flex flex-col items-end gap-1">
        {item.attachments && item.attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {item.attachments.map((a, i) =>
              a.url ? (
                <img key={i} src={a.url} alt={a.name} onClick={() => onImageClick(a.url!)} className="size-16 cursor-zoom-in rounded-lg border border-slate-200 object-cover transition-transform hover:scale-[1.03]" />
              ) : (
                <span key={i} className="rounded-lg border border-slate-200 bg-white/65 px-2 py-1 text-[11px] text-slate-600">📄 {a.name}</span>
              ),
            )}
          </div>
        )}
        {shown.trim() && (
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm border border-blue-200 bg-blue-500 px-3 py-2 text-sm text-white shadow-[0_10px_24px_-16px_rgba(37,99,235,0.65)]">
            {shown}
          </div>
        )}
      </div>
    )
  }
  if (item.kind === 'assistant') {
    if (!item.text.trim()) return null
    return (
      <div className="max-w-[92%] rounded-2xl rounded-tl-sm border border-slate-200/90 bg-white/72 px-3.5 py-2.5 shadow-[0_12px_30px_-26px_rgba(15,23,42,0.32)]">
        <div className="fc-md" dangerouslySetInnerHTML={{ __html: assistantHtml }} />
      </div>
    )
  }
  // 本模块聊天框不展示工具调用信息（item.kind === 'tool' 直接忽略）。
  if (item.kind === 'error') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
        出错：{item.message}
      </div>
    )
  }
  return null
})
