import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlertTriangle, Bot, CheckCircle2, GitPullRequestArrow, Loader2, Paperclip, RefreshCw, Send, ShieldCheck, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  MessageList,
  AttachmentChips,
  QueuedList,
  getPublicReview,
  loadPublicReviewMessages,
  submitPublicReviewFeedback,
  uploadReviewAttachment,
  useClaudeChatSocket,
  type ChatItem,
  type UploadedAttachment,
} from '@/features/claude-chat/public-api'
import sheepAvatar from '../assets/wyoooni-ai-sheep-avatar.png'

const HISTORY_PAGE_SIZE = 100
const MAX_HISTORY_PAGES = 200
const SUBMITTED_STORAGE_PREFIX = 'kai-toolbox:review-submitted:'
const FINAL_SUMMARY_SOURCE_PREFIX = 'final-summary-v1:'
const FINAL_REVIEW_SUMMARY_PROMPT = `请基于本次评审会话从评审开始以来的全部业务问题、测试问题、截图分析和你的回答，整理一份可直接交给开发人员执行的最终评审结论。

要求：
1. 按“必须修复的问题 / 测试与验收场景 / 风险与待确认项”组织；
2. 合并重复问题，保留具体复现步骤、预期结果和影响范围；
3. 如果信息冲突或尚未确认，请明确标注，不要猜测；
4. 只输出最终交接结论，不要描述整理过程。`

type SummaryPhase = 'idle' | 'preparing' | 'generating' | 'submitting'

interface ReviewConclusion {
  sourceMessageId: string
  text: string
  ts: number
}

type ReviewAttachment = UploadedAttachment & { url?: string }
type FailedReviewUpload = { id: string; file: File; url?: string; message: string }

function ReviewAvatar({ className }: { className: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <span aria-label="AI 评审" className={`inline-flex items-center justify-center bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200 ${className}`}><Bot className="size-1/2" /></span>
  return <img src={sheepAvatar} alt="AI 评审" className={className} onError={() => setFailed(true)} />
}

/**
 * 实时消息 ID 是浏览器随机值，刷新后历史消息 ID 又会变成 h&lt;index&gt;，不能用于服务端去重。
 * 对完整回答文本做双 32-bit 指纹，同一评审空间内即使刷新重提也会命中数据库唯一键。
 */
function conclusionSourceId(text: string): string {
  const normalized = text.trim()
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  return `assistant-content-v1:${(first >>> 0).toString(36)}:${(second >>> 0).toString(36)}:${normalized.length}`
}

function conclusionsFromItems(items: ChatItem[], reviewCreatedAt: number, includeUndated: boolean): ReviewConclusion[] {
  const bySourceId = new Map<string, ReviewConclusion>()
  for (const item of items) {
    if (item.kind !== 'assistant' || !item.text.trim()) continue
    if (item.ts == null && !includeUndated) continue
    if (item.ts != null && item.ts < reviewCreatedAt) continue
    const text = item.text.trim()
    const sourceMessageId = conclusionSourceId(text)
    const existing = bySourceId.get(sourceMessageId)
    const ts = item.ts ?? reviewCreatedAt
    if (!existing || ts < existing.ts) bySourceId.set(sourceMessageId, { sourceMessageId, text, ts })
  }
  return [...bySourceId.values()].sort((left, right) => left.ts - right.ts)
}

function mergeConclusions(...groups: ReviewConclusion[][]): ReviewConclusion[] {
  const merged = new Map<string, ReviewConclusion>()
  for (const conclusion of groups.flat()) {
    const existing = merged.get(conclusion.sourceMessageId)
    if (!existing || conclusion.ts < existing.ts) merged.set(conclusion.sourceMessageId, conclusion)
  }
  return [...merged.values()].sort((left, right) => left.ts - right.ts)
}

/** 从最近一页向前回溯，碰到评审空间创建时间即停止，避免把 FULL_FORK 的开发历史当作评审结论。 */
async function loadAllReviewConclusions(token: string, reviewCreatedAt: number, includeUndated: boolean): Promise<ReviewConclusion[]> {
  const collected: ReviewConclusion[][] = []
  let before: number | null = null
  for (let pageIndex = 0; pageIndex < MAX_HISTORY_PAGES; pageIndex += 1) {
    const page = await loadPublicReviewMessages(token, before, HISTORY_PAGE_SIZE)
    collected.push(conclusionsFromItems(page.items, reviewCreatedAt, includeUndated))
    const reachedReviewBoundary = page.items.some(item => item.ts != null && item.ts < reviewCreatedAt)
    if (reachedReviewBoundary || page.nextBefore == null || page.nextBefore <= 0) break
    before = page.nextBefore
  }
  return mergeConclusions(...collected)
}

function readSubmitted(reviewSessionId: string): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${SUBMITTED_STORAGE_PREFIX}${reviewSessionId}`) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeSubmitted(reviewSessionId: string, ids: Set<string>): void {
  try {
    localStorage.setItem(`${SUBMITTED_STORAGE_PREFIX}${reviewSessionId}`, JSON.stringify([...ids]))
  } catch {
    // 隐私模式或存储配额不足时仍可依赖服务端唯一键保证重复请求幂等。
  }
}

export function ReviewPage() {
  const { token = '' } = useParams()
  const chat = useClaudeChatSocket({ channel: 'review', reviewToken: token })
  const [review, setReview] = useState<Awaited<ReturnType<typeof getPublicReview>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [snapshotOpen, setSnapshotOpen] = useState(true)
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<ReviewAttachment[]>([])
  const [uploading, setUploading] = useState(0)
  const [failedUploads, setFailedUploads] = useState<FailedReviewUpload[]>([])
  const [submittingLatest, setSubmittingLatest] = useState(false)
  const [summaryPhase, setSummaryPhase] = useState<SummaryPhase>('idle')
  const [summaryRequest, setSummaryRequest] = useState<{ coveredSourceIds: string[]; existingItemIds: string[] } | null>(null)
  const [historyConclusions, setHistoryConclusions] = useState<ReviewConclusion[]>([])
  const [submittedSourceIds, setSubmittedSourceIds] = useState<Set<string>>(new Set())
  const attachedRef = useRef<string | null>(null)
  const summarySubmissionInFlightRef = useRef(false)

  useEffect(() => {
    setSnapshotOpen(true)
    void getPublicReview(token).then(setReview).catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [token])
  useEffect(() => {
    if (!review || attachedRef.current === review.reviewSessionId) return
    attachedRef.current = review.reviewSessionId
    setSubmittedSourceIds(readSubmitted(review.reviewSessionId))
    chat.switchTo(review.reviewSessionId)
  }, [review, chat.switchTo])
  useEffect(() => {
    if (!review) return
    let active = true
    void loadAllReviewConclusions(token, review.createdAt, review.mode === 'SAFE_SNAPSHOT')
      .then(conclusions => { if (active) setHistoryConclusions(conclusions) })
      .catch(() => { /* 首次预取失败不阻断聊天；点击批量提交时会明确重试并报错。 */ })
    return () => { active = false }
  }, [review, token])

  const liveConclusions = useMemo(
    () => review ? conclusionsFromItems(chat.items, review.createdAt, review.mode === 'SAFE_SNAPSHOT') : [],
    [chat.items, review],
  )
  const knownConclusions = useMemo(
    () => mergeConclusions(historyConclusions, liveConclusions),
    [historyConclusions, liveConclusions],
  )
  const unsubmittedCount = knownConclusions.filter(item => !submittedSourceIds.has(item.sourceMessageId)).length
  const waitingForReviewAnswers = chat.running || chat.queued.length > 0
  const finalizingSummary = summaryPhase !== 'idle'
  const latestUnsubmittedConclusion = [...knownConclusions].reverse().find(item => !submittedSourceIds.has(item.sourceMessageId))
  const finalSummaryCurrent = unsubmittedCount === 0
    && [...submittedSourceIds].some(id => id.startsWith(FINAL_SUMMARY_SOURCE_PREFIX))

  const send = () => {
    if (uploading > 0 || finalizingSummary || (!text.trim() && attachments.length === 0)) return
    if (chat.running || chat.queued.length > 0) chat.enqueue(text, attachments)
    else chat.send(text, attachments)
    setText('')
    setAttachments([])
  }
  const uploadFiles = async (files: File[]) => {
    if (!files.length || finalizingSummary) return
    const available = Math.max(0, 10 - attachments.length - failedUploads.length)
    const selected = files.slice(0, available)
    if (selected.length < files.length) setError('单条评审消息最多添加 10 个附件。')
    if (!selected.length) return
    setUploading(previous => previous + selected.length); setError(null)
    for (const file of selected) {
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
      try {
        const uploaded = await uploadReviewAttachment(token, file)
        setAttachments(previous => [...previous, { ...uploaded, url: previewUrl }])
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause)
        setFailedUploads(previous => [...previous, { id: crypto.randomUUID(), file, url: previewUrl, message }])
      } finally {
        setUploading(previous => Math.max(0, previous - 1))
      }
    }
  }
  const upload = async (files: FileList | null) => uploadFiles(files ? Array.from(files) : [])
  const retryUpload = async (failed: FailedReviewUpload) => {
    setFailedUploads(previous => previous.filter(item => item.id !== failed.id))
    if (failed.url) URL.revokeObjectURL(failed.url)
    await uploadFiles([failed.file])
  }

  const startFinalSummary = async () => {
    if (!review || finalizingSummary || submittingLatest || waitingForReviewAnswers) return
    setSummaryPhase('preparing'); setError(null)
    try {
      const all = mergeConclusions(
        await loadAllReviewConclusions(token, review.createdAt, review.mode === 'SAFE_SNAPSHOT'),
        conclusionsFromItems(chat.items, review.createdAt, review.mode === 'SAFE_SNAPSHOT'),
      )
      setHistoryConclusions(all)
      if (all.length === 0) {
        setError('当前还没有可汇总的 AI 评审结论。')
        setSummaryPhase('idle')
        return
      }
      setSummaryRequest({
        coveredSourceIds: all.map(item => item.sourceMessageId),
        existingItemIds: chat.items.map(item => item.id),
      })
      setSummaryPhase('generating')
      chat.send(FINAL_REVIEW_SUMMARY_PROMPT, undefined, '汇总全部评审问题并提交')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSummaryPhase('idle')
    }
  }

  const submitLatestConclusion = async () => {
    if (!review || !latestUnsubmittedConclusion || submittingLatest || finalizingSummary || waitingForReviewAnswers) return
    setSubmittingLatest(true); setError(null)
    try {
      await submitPublicReviewFeedback(token, latestUnsubmittedConclusion.text, latestUnsubmittedConclusion.sourceMessageId)
      setSubmittedSourceIds(previous => {
        const next = new Set(previous).add(latestUnsubmittedConclusion.sourceMessageId)
        writeSubmitted(review.reviewSessionId, next)
        return next
      })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSubmittingLatest(false) }
  }

  useEffect(() => {
    if (!review || !summaryRequest || summarySubmissionInFlightRef.current) return
    const existingItemIds = new Set(summaryRequest.existingItemIds)
    const completed = [...chat.items].reverse().find(
      (item): item is Extract<ChatItem, { kind: 'result' }> => item.kind === 'result' && !existingItemIds.has(item.id),
    )
    const failed = [...chat.items].reverse().find(
      (item): item is Extract<ChatItem, { kind: 'error' }> => item.kind === 'error' && !existingItemIds.has(item.id),
    )
    if (!completed && !failed) return
    if (failed && !completed) {
      setError(`最终结论生成失败：${failed.message}`)
      setSummaryRequest(null)
      setSummaryPhase('idle')
      return
    }
    if (!completed || !['end_turn', 'success', 'completed', 'stop'].includes(completed.stopReason.trim().toLowerCase())) {
      setError(`最终结论未正常生成完成（${completed?.stopReason ?? 'unknown'}），尚未提交；可重新汇总。`)
      setSummaryRequest(null)
      setSummaryPhase('idle')
      return
    }
    const conclusion = [...chat.items].reverse().find(
      item => item.kind === 'assistant' && !existingItemIds.has(item.id) && item.text.trim(),
    )
    if (!conclusion || conclusion.kind !== 'assistant') {
      setError('AI 未返回可提交的最终结论，请重新汇总。')
      setSummaryRequest(null)
      setSummaryPhase('idle')
      return
    }

    summarySubmissionInFlightRef.current = true
    setSummaryPhase('submitting')
    const textToSubmit = conclusion.text.trim()
    const rawSourceId = conclusionSourceId(textToSubmit)
    const finalSourceId = `${FINAL_SUMMARY_SOURCE_PREFIX}${rawSourceId}`
    void submitPublicReviewFeedback(token, textToSubmit, finalSourceId)
      .then(() => {
        setSubmittedSourceIds(previous => {
          const next = new Set(previous)
          summaryRequest.coveredSourceIds.forEach(id => next.add(id))
          next.add(rawSourceId)
          next.add(finalSourceId)
          writeSubmitted(review.reviewSessionId, next)
          return next
        })
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        summarySubmissionInFlightRef.current = false
        setSummaryRequest(null)
        setSummaryPhase('idle')
      })
  }, [chat.items, review, summaryRequest, token])

  if (error && !review) return <CenteredError message={error} />
  if (!review) return <div className="flex h-dvh items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" />加载评审会话…</div>

  const visibleError = error ?? chat.errorMessage ?? chat.syncWarning
  const defaultModel = chat.models.find(model => model.isDefault)
  const transport = chat.providerDiag[0]?.transport
  const transportLabel = transport === 'sdkFallback' ? '官方 · SDK（已回退）'
    : transport === 'thirdPartySdk' ? '第三方 · SDK' : '官方 · App Server'
  const runningActivity = [...chat.items].reverse().find(item => item.kind === 'activity'
    && ['inProgress', 'in_progress', 'running', 'pending', 'started'].includes(item.status))
  const activeTurnHasAttachments = (() => {
    for (let index = chat.items.length - 1; index >= 0; index -= 1) {
      const item = chat.items[index]
      if (item.kind === 'result' || item.kind === 'error') break
      if (item.kind === 'user' && (item.attachments?.length ?? 0) > 0) return true
    }
    return false
  })()
  const runningTitle = runningActivity?.kind === 'activity' ? runningActivity.title
    : chat.state !== 'ready' ? 'Codex 正在重连'
      : activeTurnHasAttachments && chat.running ? '正在分析图片或附件'
        : chat.running ? '正在读取评审上下文并生成回复' : null
  return (
    <div className="flex h-dvh flex-col bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <header className="border-b bg-white/90 px-4 py-3 backdrop-blur dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <ReviewAvatar className="size-10 rounded-full border border-white/70 object-cover shadow-sm" />
          <div className="min-w-0 flex-1"><h1 className="truncate font-semibold">{review.title}</h1><p className="text-xs text-slate-500">关联开发会话：{review.sourceTitle} · {review.mode === 'FULL_FORK' ? '完整上下文' : '安全快照'} · 仅评审</p></div>
          <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">Review only</span>
        </div>
      </header>
      <section className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 border-b px-4 py-2 text-xs">
        <span className="rounded-full bg-indigo-500/10 px-2 py-1 text-indigo-700 dark:text-indigo-300">Codex · {defaultModel ? `默认 ${defaultModel.displayName}` : '默认模型同步中'} · 标准速度</span>
        <span className="rounded-full bg-slate-500/10 px-2 py-1">{transportLabel}</span>
        <span className="rounded-full bg-slate-500/10 px-2 py-1">Auth：{review.runtimeConfig.codexAuthAlias}</span>
        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-300">review-only</span>
        {defaultModel?.defaultReasoningEffort && <span className="text-slate-500">默认推理：{defaultModel.defaultReasoningEffort}</span>}
      </section>
      {runningTitle && <div className="mx-auto flex w-full max-w-5xl items-center gap-2 border-b border-indigo-200 bg-indigo-50/70 px-4 py-2 text-xs text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200"><ReviewAvatar className="size-7 rounded-full object-cover" /><Loader2 className="size-3.5 animate-spin" /><span>{runningTitle}</span></div>}
      {review.contextSnapshot && (
        <details open={snapshotOpen} onToggle={event => setSnapshotOpen(event.currentTarget.open)} className="mx-auto w-full max-w-5xl border-b px-4 py-2 text-xs">
          <summary className="cursor-pointer text-slate-500">评审依据：分享时保存的需求/计划快照</summary>
          <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-100">
            <p className="mb-2 text-[11px] text-indigo-700 dark:text-indigo-300">这是创建评审链接时固定保存的开发上下文，仅供评审参考；下方消息区只显示评审人员后续提出的问题和 AI 评审回复。</p>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-white/70 p-3 text-slate-800 dark:bg-slate-950/70 dark:text-slate-100">{review.contextSnapshot}</pre>
          </div>
        </details>
      )}
      {visibleError && <div className="mx-auto mt-2 flex w-full max-w-5xl gap-2 px-4 text-sm text-red-600"><AlertTriangle className="size-4 shrink-0" />{visibleError}</div>}
      <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 overflow-hidden">
        <MessageList items={chat.items} running={chat.running} sessionKey={review.reviewSessionId} engineLabel="AI 评审" connState={chat.state} assistantAvatarUrl={sheepAvatar} assistantAvatarAlt="AI 评审" onLoadEarlier={() => chat.loadHistory(false)} loadingEarlier={chat.historyLoading} exhausted={chat.historyExhausted} />
      </main>
      <footer className="border-t bg-white p-3 dark:bg-slate-900">
        <div className="mx-auto max-w-5xl">
          {knownConclusions.length > 0 && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100">
              <span className="min-w-0 flex-1">
                {finalizingSummary
                  ? summaryPhase === 'submitting' ? 'AI 已完成汇总，正在提交单份最终结论…' : 'AI 正在整理整轮评审，完成后会自动提交单份最终结论；此期间暂不接收新问题，避免遗漏。'
                  : waitingForReviewAnswers
                  ? `${chat.running ? 'AI 正在回答' : 'AI 等待继续处理'}${chat.queued.length > 0 ? `，另有 ${chat.queued.length} 条问题已排队` : ''}；全部回答完成后可一次提交所有结论。`
                  : `已识别 ${knownConclusions.length} 条评审结论；AI 可先合并去重并生成一份最终交接结论，再提交到“${review.sourceTitle}”。`}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                {latestUnsubmittedConclusion && !finalizingSummary && (
                  <Button size="sm" variant="ghost" onClick={() => void submitLatestConclusion()} disabled={submittingLatest || waitingForReviewAnswers} title="严重问题快速交接，不等待最终汇总" className="gap-1.5">
                    {submittingLatest ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    提交最新一条
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => void startFinalSummary()} disabled={finalizingSummary || submittingLatest || waitingForReviewAnswers || finalSummaryCurrent} className="gap-1.5">
                  {finalSummaryCurrent ? <CheckCircle2 className="size-4" /> : finalizingSummary ? <Loader2 className="size-4 animate-spin" /> : <GitPullRequestArrow className="size-4" />}
                  {finalSummaryCurrent ? '最终结论已提交' : finalizingSummary ? 'AI 汇总中…' : `AI 汇总并提交${unsubmittedCount > 0 ? `（${unsubmittedCount}）` : ''}`}
                </Button>
              </div>
            </div>
          )}
          <QueuedList
            items={chat.queued}
            pausedReason={chat.queuePausedReason}
            canSendNow={!chat.running && !chat.pending && chat.backgroundTasks.length === 0}
            onSendNow={chat.sendQueuedNow}
            onRemove={chat.removeQueued}
            onClear={chat.clearQueued}
          />
          <AttachmentChips
            items={attachments}
            uploading={uploading}
            onRemove={id => setAttachments(previous => {
              const removed = previous.find(item => item.id === id)
              if (removed?.url) URL.revokeObjectURL(removed.url)
              return previous.filter(item => item.id !== id)
            })}
          />
          {failedUploads.length > 0 && <div className="mt-2 flex flex-wrap gap-2 px-3">{failedUploads.map(item => <div key={item.id} className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">{item.url && <img src={item.url} alt={item.file.name} className="size-8 rounded object-cover" />}<span className="max-w-48 truncate" title={item.message}>{item.file.name}：上传失败</span><button type="button" onClick={() => void retryUpload(item)} className="inline-flex items-center gap-1 font-medium"><RefreshCw className="size-3" />重试</button><button type="button" onClick={() => { if (item.url) URL.revokeObjectURL(item.url); setFailedUploads(previous => previous.filter(value => value.id !== item.id)) }}>删除</button></div>)}</div>}
          {chat.running && <p className="mb-1 text-xs text-indigo-600 dark:text-indigo-300">{finalizingSummary ? 'AI 正在生成最终交接结论；完成并自动提交后可继续补充新问题。' : 'AI 正在回复；你仍可继续发送问题或截图，消息会排队依次处理。'}</p>}
          <div className="flex items-end gap-2 rounded-2xl border bg-white p-2 shadow-sm dark:bg-slate-950">
            <label className="cursor-pointer rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" title="上传问题截图或文档"><input className="sr-only" type="file" multiple disabled={uploading > 0 || finalizingSummary || attachments.length + failedUploads.length >= 10} onChange={e => void upload(e.target.files)} />{uploading > 0 ? <Loader2 className="size-5 animate-spin" /> : <Paperclip className="size-5" />}</label>
            <textarea value={text} disabled={finalizingSummary} onChange={e => setText(e.target.value)} onPaste={e => { const images = Array.from(e.clipboardData.items).filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => file != null); if (images.length > 0) void uploadFiles(images) }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} rows={2} placeholder={finalizingSummary ? '最终结论正在生成并提交…' : chat.running ? '继续输入下一个问题；发送后会进入队列…' : '补充业务规则，或直接 Ctrl+V 粘贴截图…'} className="max-h-36 min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60" />
            {chat.running && <Button size="icon" variant="destructive" onClick={chat.interrupt} title="中断当前回答"><Square className="size-4" /></Button>}
            <Button size="icon" onClick={send} disabled={uploading > 0 || finalizingSummary || (!text.trim() && attachments.length === 0)} title={chat.running || chat.queued.length > 0 ? '加入待发送队列' : '发送'}><Send className="size-4" /></Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-500">评审期间可连续发送问题；提交结论后由开发者在来源会话合并确认实施。</p>
        </div>
      </footer>
    </div>
  )
}

function CenteredError({ message }: { message: string }) {
  return <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center"><AlertTriangle className="size-8 text-amber-500" /><h1 className="font-semibold">无法打开评审链接</h1><p className="text-sm text-slate-500">{message}</p></div>
}
