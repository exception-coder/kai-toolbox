import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ChevronRight, ClipboardList, Loader2, MoreHorizontal, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import {
  MessageList, ReviewContextOverview, getPublicReview, getPublicReviewDelivery, loadPublicReviewMessages,
  submitPublicReviewFeedback, useClaudeChatSocket, useMobileViewport,
  type ChatItem, type MessageListHandle, type PublicReviewRequirement,
} from '@/features/claude-chat/public-api'
import { ReviewRequirementList } from '../components/ReviewRequirementList'
import { ReviewEnvironmentCheck } from '../components/ReviewEnvironmentCheck'
import { ReviewComposer } from '../components/ReviewComposer'
import { useReviewRequirements } from '../hooks/useReviewRequirements'
import { useReviewViewport } from '../hooks/useReviewViewport'
import { requirementListText } from '../lib/reviewRequirementSubmission'
import { isPublicReviewDisplayItem } from '../lib/publicReviewMessageVisibility'
import { projectReviewTurns, requirementsFromTurns, stripReviewIntentMarker, type ReviewRequirement } from '../lib/reviewMessageIntent'
import '../review-workbench.css'

async function historyCandidates(token: string, createdAt: number, includeUndated: boolean) {
  const pages: ChatItem[][] = []
  let before: number | null = null
  for (let count = 0; count < 200; count++) {
    const page = await loadPublicReviewMessages(token, before, 100)
    pages.push(page.items)
    if (page.items.some(item => item.ts != null && item.ts < createdAt) || page.nextBefore == null || page.nextBefore <= 0) {
      return requirementsFromTurns(projectReviewTurns(pages.reverse().flat(), createdAt, includeUndated), createdAt)
    }
    before = page.nextBefore
  }
  throw new Error('历史较长，候选只依据当前消息；原始记录仍可分页读取。')
}

export function ReviewPage() {
  const { token = '' } = useParams()
  // Changing the review capability starts a separate view scope, never reuses drafts or evidence across links.
  return <ReviewWorkbench key={token} token={token} />
}

function ReviewWorkbench({ token }: { token: string }) {
  const chat = useClaudeChatSocket({ channel: 'review', reviewToken: token })
  const [review, setReview] = useState<Awaited<ReturnType<typeof getPublicReview>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<ReviewRequirement[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyRetry, setHistoryRetry] = useState(0)
  const [listOpen, setListOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [environmentOpen, setEnvironmentOpen] = useState(false)
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const submittingRef = useRef(false)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<MessageListHandle>(null)
  const listTrigger = useRef<HTMLButtonElement>(null)
  const detailsTrigger = useRef<HTMLButtonElement>(null)
  const sourceTrigger = useRef<HTMLElement | null>(null)
  const restoreReading = useRef<(() => void) | undefined>(undefined)
  const attached = useRef<string | null>(null)
  const mobile = useMobileViewport()
  useReviewViewport(root)
  useEffect(() => {
    let active = true
    void getPublicReview(token).then(result => { if (active) { setReview(result); setError(null) } }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '评审链接无法打开') })
    return () => { active = false }
  }, [token])
  useEffect(() => {
    if (review && attached.current !== review.reviewSessionId) { attached.current = review.reviewSessionId; chat.switchTo(review.reviewSessionId) }
  }, [review, chat.switchTo])
  useEffect(() => {
    if (!review) return
    let active = true
    void historyCandidates(token, review.createdAt, review.mode === 'SAFE_SNAPSHOT')
      .then(items => { if (active) { setHistory(items); setHistoryError(null) } })
      .catch(cause => { if (active) setHistoryError(cause instanceof Error ? cause.message : '历史依据暂未完整读取') })
    return () => { active = false }
  }, [review, token, historyRetry])
  const live = useMemo(() => review ? requirementsFromTurns(projectReviewTurns(chat.items, review.createdAt, review.mode === 'SAFE_SNAPSHOT'), review.createdAt) : [], [chat.items, review])
  const detected = useMemo(() => {
    const found = new Map<string, ReviewRequirement>()
    for (const item of [...history, ...live]) found.set(item.sourceMessageId, item)
    return [...found.values()].sort((a, b) => a.ts - b.ts)
  }, [history, live])
  const drafts = useMemo(() => detected.map(item => ({ sourceMessageId: item.sourceMessageId, title: item.title, content: item.content, sourceText: item.sourceText, analysisText: item.analysisText })), [detected])
  const backlog = useReviewRequirements(token, drafts)
  const delivery = useQuery({ queryKey: ['public-review-delivery', token], queryFn: () => getPublicReviewDelivery(token), enabled: !!review, refetchInterval: listOpen ? 10_000 : false, retry: false })
  const display = useMemo(() => chat.items.filter(isPublicReviewDisplayItem).map(item => item.kind === 'assistant' ? { ...item, text: stripReviewIntentMarker(item.text) } : item), [chat.items])
  const capture = () => { restoreReading.current = list.current?.captureReadingPosition() }
  const restore = (trigger: HTMLButtonElement | null) => {
    requestAnimationFrame(() => { restoreReading.current?.(); trigger?.focus({ preventScroll: true }) })
  }
  const openList = () => { capture(); setListOpen(true); void backlog.reload(); void delivery.refetch() }
  const submit = async (items: PublicReviewRequirement[]) => {
    if (submittingRef.current || !delivery.data?.targetProject || !items.length) return false
    submittingRef.current = true; setSubmitting(true); setSubmitError(null)
    try {
      const content = requirementListText(items)
      if (content.length > 120_000) throw new Error('需求清单过长，请分批确认或精简说明。')
      await submitPublicReviewFeedback(token, content, undefined, [], items.map(item => ({ id: item.id, version: item.revision })), false, delivery.data.targetProject)
      await delivery.refetch()
      return true
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : '提交结果未明，清单已保留，请先刷新交付记录再重试。')
      void delivery.refetch()
      return false
    } finally { submittingRef.current = false; setSubmitting(false) }
  }
  const assistantAction = useCallback((item: Extract<ChatItem, { kind: 'assistant' }>) => {
    const suggestion = detected.find(candidate => candidate.sourceItems?.at(-1)?.id === item.id)
    if (!suggestion) return null
    const draft = backlog.candidates.find(candidate => candidate.sourceMessageId === suggestion.sourceMessageId)
    return <div className="mt-1 flex items-center gap-2"><button type="button" className="inline-flex min-h-11 items-center gap-1 text-xs text-[var(--color-muted-foreground)] underline" disabled={backlog.busy || !draft} onClick={() => draft && void backlog.add(draft)}><Plus className="size-3.5" />{draft ? '加入清单' : '已处理此建议'}</button></div>
  }, [detected, backlog])
  const source = detected.find(item => item.sourceMessageId === sourceId)
  const pending = backlog.items.filter(item => !item.confirmed).length
  const visibleError = error || chat.errorMessage || chat.syncWarning
  return <div ref={root} className="review-workbench">
    <header className="border-b"><div className="mx-auto flex h-full max-w-5xl items-center gap-1 px-2">
      <button type="button" aria-label="返回" className="inline-flex size-11 shrink-0 items-center justify-center" onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.assign('/tools/claude-chat') }}><ArrowLeft className="size-5" /></button>
      <h1 className="min-w-0 flex-1 truncate px-1 text-sm font-semibold">{review?.title || '需求评审'}</h1>
      <span aria-label={chat.running ? 'AI 运行中' : chat.state === 'ready' ? '已连接' : '连接中'} className={`size-2 shrink-0 rounded-full ${chat.state === 'ready' ? 'bg-emerald-600' : 'bg-amber-500'} ${chat.running ? 'animate-pulse' : ''}`} />
      <button ref={detailsTrigger} type="button" aria-label="会话详情与更多" className="inline-flex size-11 shrink-0 items-center justify-center" onClick={() => { capture(); setDetailsOpen(true) }}><MoreHorizontal className="size-5" /></button>
    </div></header>
    {visibleError && <p role="alert" className="mx-auto w-full max-w-5xl px-4 py-2 text-xs text-[var(--color-destructive)]">{visibleError}{!review && <button className="ml-2 underline" onClick={() => window.location.reload()}>重新打开</button>}</p>}
    <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 overflow-hidden" aria-label="评审对话">
      {review ? <MessageList ref={list} items={display} running={chat.running} sessionKey={review.reviewSessionId} engineLabel="AI 评审" connState={chat.state} showRunningFooter={false}
        renderAssistantAction={assistantAction} onLoadLatest={() => chat.loadHistory(true)} onLoadEarlier={() => chat.loadHistory(false)} loadingEarlier={chat.historyLoading} loadEarlierError={chat.historyError} exhausted={chat.historyExhausted} />
        : !error && <div className="flex items-center gap-2 px-4 text-sm text-[var(--color-muted-foreground)]"><Loader2 className="size-4 animate-spin" />正在加载评审会话…</div>}
    </main>
    <footer className="mx-auto w-full max-w-5xl shrink-0 border-t bg-[var(--color-background)]">
      <button ref={listTrigger} type="button" onClick={openList} className="flex h-11 w-full items-center gap-2 px-4 text-sm" aria-haspopup="dialog" aria-expanded={listOpen}><ClipboardList className="size-4" /><span>需求清单 · {backlog.items.length} 项</span><span className="ml-auto text-xs text-[var(--color-muted-foreground)]">{backlog.error ? '读取失败，点击重试' : backlog.busy ? '正在保存' : pending ? `待确认 ${pending}` : backlog.candidates.length ? `候选 ${backlog.candidates.length}` : '查看'}</span><ChevronRight className="size-4" /></button>
      <ReviewComposer token={token} chat={chat} />
    </footer>
    <ReviewRequirementList token={token} open={listOpen} onOpenChange={setListOpen} backlog={backlog} delivery={delivery.data} deliveryError={delivery.error?.message ?? null} onRetryDelivery={() => void delivery.refetch()} submitting={submitting} submitError={submitError} onSubmit={submit} onShowSource={id => { sourceTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setSourceId(id) }} onCloseFocus={() => restore(listTrigger.current)} />
    <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}><SheetContent side={mobile ? 'bottom' : 'right'} hideCloseButton onCloseAutoFocus={event => { event.preventDefault(); restore(detailsTrigger.current) }} className={`review-sheet flex flex-col p-0 ${mobile ? 'max-h-[88dvh] rounded-t-xl' : 'w-[36rem] max-w-[95vw]'}`}>
      <div className="flex min-h-12 items-center border-b px-4"><SheetTitle className="flex-1">会话详情</SheetTitle><button aria-label="关闭会话详情" className="inline-flex size-11 items-center justify-center" onClick={() => setDetailsOpen(false)}><X className="size-5" /></button></div>
      <SheetDescription className="px-4 py-2">项目和评审依据按需查看。</SheetDescription><div className="min-h-0 overflow-y-auto px-4 pb-4 text-sm"><p>目标项目：{delivery.data?.targetProject || '尚未核对'}</p><p className="mt-2">关联计划：{review?.sourceTitle || '正在加载'}</p><p className="mt-2 text-xs text-[var(--color-muted-foreground)]">只读讨论；提交仅登记原会话待办，执行仍由原会话确认。</p>
        {review?.contextSnapshot && <details className="mt-4 border-t py-3"><summary className="cursor-pointer text-sm">评审依据</summary><ReviewContextOverview snapshot={review.contextSnapshot} publicView className="mt-3" /></details>}
        {historyError && <p role="alert" className="mt-3 text-xs">{historyError} <button className="min-h-11 underline" onClick={() => setHistoryRetry(value => value + 1)}>重试历史依据</button></p>}
        <Button variant="outline" className="mt-3 min-h-11" onClick={() => setEnvironmentOpen(true)}>检测附件与评审环境</Button>
      </div></SheetContent></Sheet>
    <Sheet open={!!sourceId} onOpenChange={open => { if (!open) setSourceId(null) }}><SheetContent side={mobile ? 'bottom' : 'right'} hideCloseButton onCloseAutoFocus={event => { event.preventDefault(); sourceTrigger.current?.focus({ preventScroll: true }) }} className={`review-sheet flex flex-col p-0 ${mobile ? 'h-[85dvh] rounded-t-xl' : 'w-[40rem] max-w-[95vw]'}`}>
      <div className="flex min-h-12 items-center border-b px-4"><SheetTitle className="flex-1">原始讨论依据</SheetTitle><button aria-label="关闭原始讨论依据" className="inline-flex size-11 items-center justify-center" onClick={() => setSourceId(null)}><X className="size-5" /></button></div><SheetDescription className="px-4 py-2">原消息及截图沿用本评审附件权限。</SheetDescription>
      <div className="flex min-h-0 flex-1 overflow-hidden">{source?.sourceItems?.length ? <MessageList items={source.sourceItems} running={false} sessionKey={review?.reviewSessionId} engineLabel="AI 评审" showRunningFooter={false} exhausted /> : <p className="p-4 text-sm">未能读取对应原消息；清单中仍保留已保存的文字来源。<button className="min-h-11 underline" onClick={() => setHistoryRetry(value => value + 1)}>重试历史依据</button></p>}</div>
    </SheetContent></Sheet>
    <ReviewEnvironmentCheck open={environmentOpen} onOpenChange={setEnvironmentOpen} token={token} connectionState={chat.state} />
  </div>
}
