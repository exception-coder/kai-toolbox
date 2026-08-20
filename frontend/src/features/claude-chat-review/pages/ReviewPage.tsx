import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlertTriangle, Bot, CheckCircle2, ClipboardList, GitPullRequestArrow, Loader2, Paperclip, RefreshCw, Send, ShieldCheck, Square } from 'lucide-react'
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
import { ReviewRequirementList } from '../components/ReviewRequirementList'
import { useReviewRequirements } from '../hooks/useReviewRequirements'
import { requirementListText, requirementSubmissionId, requirementText } from '../lib/reviewRequirementSubmission'
import {
  INTERNAL_SUMMARY_PREFIX,
  projectReviewTurns,
  requirementsFromTurns,
  reviewRequirementSourceId,
  stripReviewIntentMarker,
  type ReviewRequirement,
} from '../lib/reviewMessageIntent'

const HISTORY_PAGE_SIZE = 100
const MAX_HISTORY_PAGES = 200
const SUBMITTED_STORAGE_PREFIX = 'kai-toolbox:review-submitted:'
const FINAL_SUMMARY_SOURCE_PREFIX = 'final-summary-v1:'
const MAX_REQUIREMENT_LIST_CONTENT_LENGTH = 120_000

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
function requirementsFromItems(items: ChatItem[], reviewCreatedAt: number, includeUndated: boolean): ReviewRequirement[] {
  return requirementsFromTurns(projectReviewTurns(items, reviewCreatedAt, includeUndated), reviewCreatedAt)
}

function mergeRequirements(...groups: ReviewRequirement[][]): ReviewRequirement[] {
  const merged = new Map<string, ReviewRequirement>()
  for (const conclusion of groups.flat()) {
    const existing = merged.get(conclusion.sourceMessageId)
    if (!existing || conclusion.ts < existing.ts) merged.set(conclusion.sourceMessageId, conclusion)
  }
  return [...merged.values()].sort((left, right) => left.ts - right.ts)
}

/** 从最近一页向前回溯，碰到评审空间创建时间即停止，避免把 FULL_FORK 的开发历史当作评审结论。 */
async function loadAllReviewRequirements(token: string, reviewCreatedAt: number, includeUndated: boolean): Promise<ReviewRequirement[]> {
  const pages: ChatItem[][] = []
  let before: number | null = null
  for (let pageIndex = 0; pageIndex < MAX_HISTORY_PAGES; pageIndex += 1) {
    const page = await loadPublicReviewMessages(token, before, HISTORY_PAGE_SIZE)
    pages.push(page.items)
    const reachedReviewBoundary = page.items.some(item => item.ts != null && item.ts < reviewCreatedAt)
    if (reachedReviewBoundary || page.nextBefore == null || page.nextBefore <= 0) break
    before = page.nextBefore
  }
  return requirementsFromItems(pages.reverse().flat(), reviewCreatedAt, includeUndated)
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
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<ReviewAttachment[]>([])
  const [uploading, setUploading] = useState(0)
  const [failedUploads, setFailedUploads] = useState<FailedReviewUpload[]>([])
  const [submittingLatest, setSubmittingLatest] = useState(false)
  const [submittingList, setSubmittingList] = useState(false)
  const [requirementListOpen, setRequirementListOpen] = useState(false)
  const [historyRequirements, setHistoryRequirements] = useState<ReviewRequirement[]>([])
  const [submittedSourceIds, setSubmittedSourceIds] = useState<Set<string>>(new Set())
  const [latestSubmittedListSourceId, setLatestSubmittedListSourceId] = useState<string | null>(null)
  const attachedRef = useRef<string | null>(null)

  useEffect(() => {
    setSnapshotOpen(false)
    void getPublicReview(token).then(setReview).catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [token])
  useEffect(() => {
    if (!review || attachedRef.current === review.reviewSessionId) return
    attachedRef.current = review.reviewSessionId
    const restored = readSubmitted(review.reviewSessionId)
    ;(review.coveredSourceMessageIds ?? []).forEach(id => restored.add(id))
    setSubmittedSourceIds(restored)
    setLatestSubmittedListSourceId(review.latestSubmittedSummarySourceId ?? null)
    writeSubmitted(review.reviewSessionId, restored)
    chat.switchTo(review.reviewSessionId)
  }, [review, chat.switchTo])
  useEffect(() => {
    if (!review) return
    let active = true
    void loadAllReviewRequirements(token, review.createdAt, review.mode === 'SAFE_SNAPSHOT')
      .then(requirements => { if (active) setHistoryRequirements(requirements) })
      .catch(() => { /* 首次预取失败不阻断聊天；点击批量提交时会明确重试并报错。 */ })
    return () => { active = false }
  }, [review, token])

  const liveTurns = useMemo(
    () => review ? projectReviewTurns(chat.items, review.createdAt, review.mode === 'SAFE_SNAPSHOT') : [],
    [chat.items, review],
  )
  const liveRequirements = useMemo(
    () => review ? requirementsFromTurns(liveTurns, review.createdAt) : [],
    [liveTurns, review],
  )
  const detectedRequirements = useMemo(
    () => mergeRequirements(historyRequirements, liveRequirements),
    [historyRequirements, liveRequirements],
  )
  const requirementDrafts = useMemo(() => detectedRequirements.map(item => ({
    sourceMessageId: item.sourceMessageId,
    title: item.title,
    content: item.content,
  })), [detectedRequirements])
  const requirementList = useReviewRequirements(token, requirementDrafts)
  const userIntentById = useMemo(() => new Map(liveTurns.map(turn => [turn.userItem.id, turn.intent])), [liveTurns])
  const consultationCount = liveTurns.filter(turn => turn.intent === 'CONSULTATION').length
  const unclassifiedCount = liveTurns.filter(turn => turn.intent === 'UNCLASSIFIED').length
  const pendingIntentCount = liveTurns.filter(turn => turn.intent === 'PENDING').length
  const displayItems = useMemo(() => chat.items.map(item => {
    if (item.kind === 'assistant') return { ...item, text: stripReviewIntentMarker(item.text) }
    if (item.kind === 'user' && item.text.startsWith(INTERNAL_SUMMARY_PREFIX)) {
      return { ...item, displayText: item.displayText ?? '汇总已识别的业务需求并提交' }
    }
    return item
  }), [chat.items])
  const requirementSubmissionIds = useMemo(() => new Map(requirementList.items.map(item => [
    item.id,
    requirementSubmissionId(item),
  ])), [requirementList.items])
  const unsubmittedRequirements = requirementList.items.filter(item =>
    !submittedSourceIds.has(requirementSubmissionIds.get(item.id) ?? ''))
  const unsubmittedCount = unsubmittedRequirements.length
  const waitingForReviewAnswers = chat.running || chat.queued.length > 0
  const finalizingSummary = submittingList
  const latestUnsubmittedConclusion = [...unsubmittedRequirements].reverse()[0]
  const hasPreviousSummary = review?.hasSubmittedSummary === true
    || [...submittedSourceIds].some(id => id.startsWith(FINAL_SUMMARY_SOURCE_PREFIX))
  const currentListContent = requirementListText(requirementList.items)
  const currentListSnapshotId = reviewRequirementSourceId(currentListContent)
  const currentFinalSourceId = `${FINAL_SUMMARY_SOURCE_PREFIX}${currentListSnapshotId}`
  const listNeedsSubmission = (requirementList.items.length > 0 || hasPreviousSummary)
    && latestSubmittedListSourceId !== currentFinalSourceId
  const finalSummaryCurrent = !listNeedsSubmission && hasPreviousSummary

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

  const submitRequirementList = async () => {
    if (!review || submittingList || submittingLatest || waitingForReviewAnswers) return
    if (!listNeedsSubmission) return
    setSubmittingList(true); setError(null)
    try {
      const content = currentListContent
      if (content.length > MAX_REQUIREMENT_LIST_CONTENT_LENGTH) {
        setError('当前需求清单内容过长，请精简重复说明后再提交。')
        return
      }
      const currentIds = requirementList.items.map(item => requirementSubmissionIds.get(item.id)!).filter(Boolean)
      await submitPublicReviewFeedback(token, content, currentFinalSourceId, [...currentIds, currentListSnapshotId])
      setSubmittedSourceIds(previous => {
        const next = new Set(previous)
        currentIds.forEach(id => next.add(id))
        next.add(currentListSnapshotId)
        next.add(currentFinalSourceId)
        writeSubmitted(review.reviewSessionId, next)
        return next
      })
      setLatestSubmittedListSourceId(currentFinalSourceId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmittingList(false)
    }
  }

  const submitLatestConclusion = async () => {
    if (!review || !latestUnsubmittedConclusion || submittingLatest || finalizingSummary || waitingForReviewAnswers) return
    setSubmittingLatest(true); setError(null)
    try {
      const content = requirementText(latestUnsubmittedConclusion.title, latestUnsubmittedConclusion.content)
      const sourceMessageId = requirementSubmissionIds.get(latestUnsubmittedConclusion.id)!
      await submitPublicReviewFeedback(token, content, sourceMessageId, [sourceMessageId])
      setSubmittedSourceIds(previous => {
        const next = new Set(previous).add(sourceMessageId)
        writeSubmitted(review.reviewSessionId, next)
        return next
      })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSubmittingLatest(false) }
  }

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
        <MessageList
          items={displayItems}
          running={chat.running}
          sessionKey={review.reviewSessionId}
          engineLabel="AI 评审"
          connState={chat.state}
          assistantAvatarUrl={sheepAvatar}
          assistantAvatarAlt="AI 评审"
          getUserMessageBadge={item => {
            if (item.text.startsWith(INTERNAL_SUMMARY_PREFIX)) return null
            const intent = userIntentById.get(item.id)
            const inferred = item.reviewIntent?.classificationStatus === 'INFERRED'
            if (intent === 'REQUIREMENT') return { label: inferred ? '需求反馈 · AI推断' : '需求反馈', tone: 'primary', title: '此消息提出了业务需求，将纳入汇总' }
            if (intent === 'CONSULTATION') return { label: inferred ? '沟通咨询 · AI推断' : '沟通咨询', tone: 'muted', title: '此消息属于普通沟通，不纳入需求汇总' }
            if (intent === 'PENDING') return { label: '判断中', tone: 'muted', title: 'AI 回复完成后判定是否属于需求' }
            return { label: '待确认需求', tone: 'warning', title: '这条消息的业务诉求仍有歧义，已先加入需求清单，请核对后修改或删除' }
          }}
          onLoadEarlier={() => chat.loadHistory(false)}
          loadingEarlier={chat.historyLoading}
          exhausted={chat.historyExhausted}
        />
      </main>
      <footer className="border-t bg-white p-3 dark:bg-slate-900">
        <div className="mx-auto max-w-5xl">
          {(
            <div className="mb-2 flex flex-col gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <span className="sm:hidden">
                {finalizingSummary
                  ? '正在提交当前需求清单…'
                  : waitingForReviewAnswers
                  ? `${chat.running ? 'AI 正在回答' : '等待继续处理'}${chat.queued.length > 0 ? ` · ${chat.queued.length} 条待处理` : ''}`
                  : finalSummaryCurrent ? '最终结论已提交'
                  : `${listNeedsSubmission && hasPreviousSummary ? '清单待更新' : `需求 ${requirementList.items.length} 条`} · 沟通 ${consultationCount} 条`}
              </span>
              <span className="hidden min-w-0 flex-1 sm:inline">
                {finalizingSummary
                  ? '正在把评审员确认后的当前需求清单提交到开发会话…'
                  : waitingForReviewAnswers
                  ? `${chat.running ? 'AI 正在回答并判断消息性质' : 'AI 等待继续处理'}${chat.queued.length > 0 ? `，另有 ${chat.queued.length} 条消息已排队` : ''}；回答完成后只汇总其中的业务需求。`
                  : listNeedsSubmission && hasPreviousSummary
                  ? `当前清单有${unsubmittedCount > 0 ? ` ${unsubmittedCount} 条新增或修改需求` : '删除变更'}待交接；提交时会发送完整清单快照。`
                  : `当前清单 ${requirementList.items.length} 条业务需求、${consultationCount} 条沟通咨询${unclassifiedCount > 0 ? `、${unclassifiedCount} 条未分类` : ''}${pendingIntentCount > 0 ? `、${pendingIntentCount} 条判断中` : ''}；仅清单内容会提交到“${review.sourceTitle}”。`}
              </span>
              <div className="grid w-full shrink-0 grid-cols-2 items-center gap-2 sm:flex sm:w-auto">
                <Button size="sm" variant="ghost" onClick={() => setRequirementListOpen(true)} className="min-w-0 flex-1 gap-1.5 px-2 sm:flex-none sm:px-3">
                  <ClipboardList className="size-4" />需求清单（{requirementList.items.length}）
                </Button>
                {latestUnsubmittedConclusion && !finalizingSummary && (
                  <Button size="sm" variant="ghost" onClick={() => void submitLatestConclusion()} disabled={submittingLatest || waitingForReviewAnswers} title="严重问题快速交接，不等待最终汇总" className="min-w-0 flex-1 gap-1.5 px-2 sm:flex-none sm:px-3">
                    {submittingLatest ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    提交最新一条
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => void submitRequirementList()} disabled={finalizingSummary || submittingLatest || waitingForReviewAnswers || finalSummaryCurrent || !listNeedsSubmission || requirementList.loading || requirementList.syncing} className={`${latestUnsubmittedConclusion ? 'col-span-2' : ''} min-w-0 flex-1 gap-1.5 px-2 sm:flex-none sm:px-3`}>
                  {finalSummaryCurrent ? <CheckCircle2 className="size-4" /> : finalizingSummary ? <Loader2 className="size-4 animate-spin" /> : <GitPullRequestArrow className="size-4" />}
                  <span className="sm:hidden">{finalSummaryCurrent ? '已提交' : finalizingSummary ? '提交中…' : !listNeedsSubmission ? '暂无需求' : `${hasPreviousSummary ? '提交更新' : '提交清单'}${unsubmittedCount > 0 ? `（${unsubmittedCount}）` : ''}`}</span>
                  <span className="hidden sm:inline">{finalSummaryCurrent ? '需求清单已提交' : finalizingSummary ? '提交中…' : !listNeedsSubmission ? '暂无需求可提交' : `${hasPreviousSummary ? '提交清单更新' : '提交需求清单'}${unsubmittedCount > 0 ? `（${unsubmittedCount}）` : ''}`}</span>
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
          {chat.running && <p className="mb-1 text-xs text-indigo-600 dark:text-indigo-300">AI 正在回复；你仍可继续发送问题或截图，消息会排队依次处理。</p>}
          <div className="flex items-end gap-2 rounded-2xl border bg-white p-2 shadow-sm dark:bg-slate-950">
            <label className="cursor-pointer rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" title="上传问题截图或文档"><input className="sr-only" type="file" multiple disabled={uploading > 0 || finalizingSummary || attachments.length + failedUploads.length >= 10} onChange={e => void upload(e.target.files)} />{uploading > 0 ? <Loader2 className="size-5 animate-spin" /> : <Paperclip className="size-5" />}</label>
            <textarea value={text} disabled={finalizingSummary} onChange={e => setText(e.target.value)} onPaste={e => { const images = Array.from(e.clipboardData.items).filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => file != null); if (images.length > 0) void uploadFiles(images) }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} rows={2} placeholder={finalizingSummary ? '最终结论正在生成并提交…' : chat.running ? '继续输入下一个问题；发送后会进入队列…' : '补充业务规则，或直接 Ctrl+V 粘贴截图…'} className="max-h-36 min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60" />
            {chat.running && <Button size="icon" variant="destructive" onClick={chat.interrupt} title="中断当前回答"><Square className="size-4" /></Button>}
            <Button size="icon" onClick={send} disabled={uploading > 0 || finalizingSummary || (!text.trim() && attachments.length === 0)} title={chat.running || chat.queued.length > 0 ? '加入待发送队列' : '发送'}><Send className="size-4" /></Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-500">评审期间可连续发送问题；提交结论后由开发者在来源会话合并确认实施。</p>
        </div>
      </footer>
      <ReviewRequirementList
        open={requirementListOpen}
        onOpenChange={setRequirementListOpen}
        items={requirementList.items}
        loading={requirementList.loading}
        syncing={requirementList.syncing}
        error={requirementList.error}
        busyIds={requirementList.busyIds}
        onReload={() => void requirementList.reload()}
        onSave={requirementList.save}
        onDelete={requirementList.remove}
      />
    </div>
  )
}

function CenteredError({ message }: { message: string }) {
  return <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center"><AlertTriangle className="size-8 text-amber-500" /><h1 className="font-semibold">无法打开评审链接</h1><p className="text-sm text-slate-500">{message}</p></div>
}
