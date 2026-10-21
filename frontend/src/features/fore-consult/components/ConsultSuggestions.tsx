import { useEffect, useRef, useState, type RefObject } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquarePlus, ArrowUpRight, Loader2, X } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { listSuggestions, normalizeSuggestion, submitSuggestion, retrySuggestionReview, type SuggestionDraft } from '../suggestionApi'
import { ConsultDevelopmentSession } from './ConsultDevelopmentSession'

const emptyDraft: SuggestionDraft = { title: '', problem: '', expected: '', acceptance: '' }
const stateLabel: Record<string, string> = { PENDING_REVIEW: '待评审', REVIEW_PENDING: '等待审核', REVIEWING: '正在审核', REVIEW_FAILED: '审核未完成', REJECTED: '未通过审核', QUEUED: '待实现', MANUAL_QUEUED: '待实现 · 需人工接续', RUNNING: '实现中', COMMITTED: '待发布', FAILED: '待实现 · 自动开发中断' }
interface StoredDraft { original: string; draft: SuggestionDraft; requestId: string }
function restore(key: string): StoredDraft {
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) ?? 'null') as StoredDraft | null
    if (stored && typeof stored.original === 'string' && stored.draft
      && Object.keys(emptyDraft).every(field => typeof stored.draft[field as keyof SuggestionDraft] === 'string')
      && typeof stored.requestId === 'string') return stored
  } catch { /* 浏览器存储不可用时仍可在当前页面提交。 */ }
  return { original: '', draft: { ...emptyDraft }, requestId: crypto.randomUUID() }
}

/** 同一个抽屉同时承载反馈和建议清单；关闭后保留用户自己的草稿与幂等标识。 */
export function ConsultSuggestions({ userId, open, onOpenChange, compact = false, fallbackFocusRef }: {
  userId: number; open: boolean; onOpenChange: (open: boolean) => void; compact?: boolean; fallbackFocusRef?: RefObject<HTMLElement | null>
}) {
  const storageKey = `toolbox.consult.suggestion-draft:${userId}`
  const [form, setForm] = useState(() => restore(storageKey))
  const [busy, setBusy] = useState<'normalize' | 'submit' | null>(null)
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState(false)
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [showDevelopment, setShowDevelopment] = useState(false)
  const returnFocus = useRef<HTMLElement | null>(null)
  const openTarget = useRef<string | null>(null)
  const client = useQueryClient()
  const query = useInfiniteQuery({ queryKey: ['consult-suggestions', userId], initialPageParam: 0,
    queryFn: ({ pageParam }) => listSuggestions(pageParam),
    getNextPageParam: (page, pages) => {
      const loaded = pages.reduce((count, part) => count + part.items.length, 0)
      return page.items.length > 0 && loaded < page.total ? loaded : undefined
    }, staleTime: 30000, retry: false, refetchInterval: open ? 15000 : false })
  const suggestions = query.data?.pages.flatMap(page => page.items) ?? []
  const total = query.data?.pages[0]?.total ?? 0
  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify(form)) } catch { /* 页面内草稿仍保留。 */ } }, [storageKey, form])
  useEffect(() => {
    if (open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      void query.refetch()
    }
  // 打开时刷新，不因请求对象变化重复发起。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const changed = (patch: Partial<StoredDraft>) => {
    setForm(current => ({ ...current, ...patch, requestId: crypto.randomUUID() }))
    setMessage(''); setSubmitted(null)
  }
  const normalize = async () => {
    setBusy('normalize'); setMessage(''); setFailure(false)
    try {
      const draft = await normalizeSuggestion(form.original)
      changed({ draft }); setMessage('已整理，请核对或修改后提交。')
    } catch {
      setFailure(true); setMessage('自动整理未完成，原文已保留。可以重试，或直接填写下方需求描述后提交。')
    } finally { setBusy(null) }
  }
  const submit = async () => {
    setBusy('submit'); setMessage(''); setFailure(false)
    try {
      const saved = await submitSuggestion(form.requestId, form.original, form.draft)
      setSubmitted(saved.id)
      setForm({ original: '', draft: { ...emptyDraft }, requestId: crypto.randomUUID() })
      setMessage('建议已保存，正在等待审核。通过后进入需求队列；简单改进自动开发，复杂需求排队处理。')
      void client.invalidateQueries({ queryKey: ['consult-suggestions', userId] })
    } catch {
      setFailure(true); setMessage('未收到提交成功结果，草稿已保留。可刷新清单核对，或重试同一提交，不会重复登记。')
    } finally { setBusy(null) }
  }
  const fieldClass = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60'
  return <>
    {!compact && <aside aria-label="业务咨询需求建议卡片" className="pointer-events-auto absolute bottom-20 right-6 z-[25] w-[232px] rounded-lg border border-border bg-background p-4 text-foreground shadow-sm">
      <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-medium">需求建议</h2><span className="text-xs text-muted-foreground">{query.isError ? '暂不可用' : `${total} 条`}</span></div>
      <p className="mt-1 text-xs text-muted-foreground">一起把咨询助手用得更顺手</p>
      {query.isPending ? <p role="status" className="mt-3 text-xs text-muted-foreground">正在读取建议…</p>
        : query.isError ? <button className="mt-3 min-h-11 text-xs underline" onClick={() => void query.refetch()}>读取失败，重试</button>
        : suggestions.length ? <ul className="my-3 space-y-2">{suggestions.slice(0, 3).map(item => <li key={item.id}><button aria-label={item.title} onClick={() => { setShowDevelopment(false); openTarget.current = item.id; setSubmitted(item.id); onOpenChange(true) }} className="flex w-full items-start justify-between gap-2 text-left text-xs hover:underline"><span className="truncate">{item.title}</span><span className="shrink-0 text-[10px] text-muted-foreground">{stateLabel[item.state ?? 'PENDING_REVIEW'] ?? '待核对'}</span></button></li>)}</ul>
        : <p className="my-3 text-xs text-muted-foreground">还没有建议，欢迎说说你的想法。</p>}
      <button type="button" onClick={() => { setSubmitted(null); setShowDevelopment(false); onOpenChange(true) }} className="mt-2 inline-flex min-h-11 w-full items-center justify-between gap-2 border-t border-border pt-2 text-xs focus-visible:outline-2 focus-visible:outline-ring"><span className="flex items-center gap-2"><MessageSquarePlus className="size-4" />反馈与建议清单</span><ArrowUpRight className="size-3" /></button>
      <button type="button" onClick={() => { setShowDevelopment(true); onOpenChange(true) }} className="min-h-11 text-xs text-muted-foreground underline">查看后台开发会话</button>
    </aside>}
    <Sheet open={open} onOpenChange={next => { if (!busy) onOpenChange(next) }}>
      <SheetContent hideCloseButton className="flex h-[100dvh] w-full max-w-[560px] flex-col bg-background p-0 text-foreground"
        onOpenAutoFocus={event => {
          if (openTarget.current) { event.preventDefault(); const item = document.getElementById(`suggestion-${openTarget.current}`); item?.scrollIntoView?.({ block: 'start' }); item?.focus() }
        }}
        onCloseAutoFocus={event => { openTarget.current = null; event.preventDefault(); if (returnFocus.current?.isConnected && returnFocus.current !== document.body) returnFocus.current.focus(); else fallbackFocusRef?.current?.focus() }}>
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border p-5">
          <div><SheetTitle>业务咨询需求建议</SheetTitle><SheetDescription className="mt-1 text-xs">仅接收业务咨询板块的优化建议，不接收扩大权限或放开限制的需求。审核通过后排队处理，简单改进可自动开发并提交，发布前仍需验收。</SheetDescription></div>
          <button type="button" aria-label="关闭需求建议" disabled={!!busy} onClick={() => onOpenChange(false)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-muted disabled:opacity-50"><X className="size-4" /></button>
        </header>
        <nav aria-label="需求建议视图" className="flex shrink-0 gap-4 border-b border-border px-5 text-sm"><button type="button" disabled={!!busy} aria-pressed={!showDevelopment} onClick={() => setShowDevelopment(false)} className="min-h-11 aria-pressed:font-medium disabled:opacity-50">需求建议</button><button type="button" disabled={!!busy} aria-pressed={showDevelopment} onClick={() => setShowDevelopment(true)} className="min-h-11 aria-pressed:font-medium disabled:opacity-50">开发会话</button></nav>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          {showDevelopment ? <ConsultDevelopmentSession userId={userId} /> : <>
          <form onSubmit={event => { event.preventDefault(); void submit() }} className="space-y-3">
            <label className="block text-xs font-medium">你的原始建议<textarea aria-label="你的原始建议" disabled={!!busy} value={form.original} maxLength={8000} rows={3}
              onChange={event => changed({ original: event.target.value, draft: { ...emptyDraft } })} className={`${fieldClass} mt-2`} placeholder="例如：手机上看长回答不方便，希望能一键回到最近消息。" /></label>
            <button type="button" disabled={!!busy || !form.original.trim()} onClick={() => void normalize()}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-xs hover:bg-muted disabled:opacity-50">{busy === 'normalize' && <Loader2 className="size-4 animate-spin" />}整理成需求描述</button>
            <p className="text-xs text-muted-foreground">AI仅整理表达，不代表已确认需求；也可直接手动填写。</p>
            {(['title', 'problem', 'expected', 'acceptance'] as const).map(field => {
              const label = { title: '需求标题', problem: '遇到的问题', expected: '期望改进', acceptance: '怎样算改好了（可选）' }[field]
              return <label key={field} className="block text-xs font-medium">{label}{field === 'title'
                ? <input aria-label={label} disabled={!!busy} value={form.draft[field]} maxLength={120} required className={`${fieldClass} mt-1`} onChange={event => changed({ draft: { ...form.draft, [field]: event.target.value } })} />
                : <textarea aria-label={label} disabled={!!busy} value={form.draft[field]} maxLength={3000} rows={2} required={field !== 'acceptance'} className={`${fieldClass} mt-1`} onChange={event => changed({ draft: { ...form.draft, [field]: event.target.value } })} />}</label>
            })}
            <button type="submit" disabled={!!busy || !form.original.trim() || !form.draft.title.trim() || !form.draft.problem.trim() || !form.draft.expected.trim()}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">{busy === 'submit' && <Loader2 className="size-4 animate-spin" />}提交建议</button>
            {busy && <p role="status" className="text-xs text-muted-foreground">{busy === 'normalize' ? '正在整理，原文会保留…' : '正在登记，请等待结果后关闭…'}</p>}
            {message && <p role={failure ? 'alert' : 'status'} className={`text-xs leading-relaxed ${failure ? 'text-destructive' : 'text-muted-foreground'}`}>{message}</p>}
          </form>
          <section aria-label="需求建议清单" className="mt-8 border-t border-border pt-5">
            <div className="flex items-center justify-between"><h3 className="text-sm font-medium">建议清单{query.data ? ` · ${total}` : ''}</h3><button onClick={() => void query.refetch()} className="min-h-11 px-2 text-xs underline">刷新清单</button></div>
            {query.isError && <p role="alert" className="text-xs text-destructive">暂时无法读取清单，反馈草稿已保留，请刷新重试。</p>}
            {!query.isPending && !query.isError && !suggestions.length && <p className="py-4 text-sm text-muted-foreground">还没有建议。提交后会显示在这里。</p>}
            <ul className="divide-y divide-border">{suggestions.map(item => <li key={item.id} id={`suggestion-${item.id}`} tabIndex={-1} className={`py-4 ${submitted === item.id ? 'border-l-2 border-primary pl-3' : ''}`}>
              <h4 className="break-words text-sm font-medium">{item.title}</h4><p className="mt-1 text-xs text-muted-foreground">{stateLabel[item.state ?? 'PENDING_REVIEW'] ?? '状态待核对'} · {new Date(item.createdAt).toLocaleDateString()}</p>
              {item.reason && <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{item.reason}</p>}
              {item.commitHash && <p className="mt-2 text-xs text-muted-foreground">提交 {item.commitHash.slice(0, 8)} · 尚未发布</p>}
              {item.state === 'REVIEW_FAILED' && <button type="button" className="min-h-11 text-xs underline" onClick={async () => {
                try { await retrySuggestionReview(item.id); setFailure(false); setMessage('已重新排队审核。'); void query.refetch() }
                catch { setFailure(true); setMessage('无法重新审核，仅提交人可以重试本人审核失败的建议，请刷新核对。') }
              }}>重试审核（仅提交人）</button>}
              <dl className="mt-3 space-y-2 text-sm">{([['问题', item.problem], ['期望', item.expected], ['完成标准', item.acceptance]] as const).filter(([, value]) => value).map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{value}</dd></div>)}</dl>
              <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer py-1">查看原始建议</summary><p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{item.original}</p></details>
            </li>)}</ul>
            {query.hasNextPage && <button onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage} className="min-h-11 w-full text-xs underline disabled:opacity-50">{query.isFetchingNextPage ? '正在加载…' : '加载更多建议'}</button>}
          </section>
          </>}
        </div>
      </SheetContent>
    </Sheet>
  </>
}
