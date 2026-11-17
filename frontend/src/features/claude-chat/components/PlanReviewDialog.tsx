import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import type { Engine } from '../types'
import { engineName } from './chatStatus'
import { Markdown } from './Markdown'
import { changePlanReview, createPlanReview, getPlanReview, listPlanReviews, planReviewRequestId,
  REVIEW_ENGINES, REVIEW_ENGINE_LIMITATIONS, reviewQuote, reviewUuid, type PlanReviewTask } from '../lib/planReviewApi'

interface Props {
  sessionId: string; initial?: { id: string; text: string }; engines: Engine[]
  onClose: () => void; onQuote: (text: string) => void; returnFocus: () => void
}
const labels: Record<PlanReviewTask['status'], string> = {
  QUEUED: '等待评审', RUNNING: '正在评审', SUCCEEDED: '评审完成', FAILED: '评审失败', CANCELLED: '已取消', INTERRUPTED: '结果未确认',
}

export function PlanReviewDialog({ sessionId, initial, engines, onClose, onQuote, returnFocus }: Props) {
  const portal = useFullscreenPortalContainer()
  const queries = useQueryClient()
  const available = REVIEW_ENGINES.filter(engine => engines.includes(engine) && !REVIEW_ENGINE_LIMITATIONS[engine])
  const [selected, setSelected] = useState<Engine[]>(available.slice(0, 2))
  const [material, setMaterial] = useState(initial?.text ?? '')
  const [focus, setFocus] = useState('')
  const draftBaseline = useRef({ material: initial?.text ?? '', focus: '' })
  const [composing, setComposing] = useState(!!initial)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [closeRequested, setCloseRequested] = useState(false)
  const retryIds = useRef(new Map<string, string>())
  const history = useQuery({ queryKey: ['plan-reviews', sessionId], queryFn: ({ signal }) => listPlanReviews(sessionId, signal),
    refetchInterval: 3000, retry: false })
  const detail = useQuery({ queryKey: ['plan-review', sessionId, reviewId], enabled: !!reviewId,
    queryFn: ({ signal }) => getPlanReview(sessionId, reviewId!, signal), retry: false,
    refetchInterval: query => query.state.data?.tasks.some(t => t.status === 'RUNNING' || t.status === 'QUEUED') ? 2000 : false })

  async function submit() {
    if (busyRef.current || !material.trim() || !selected.length) return
    if (selected.some(engine => !available.includes(engine))) {
      setError('所选引擎的可用状态已变化，请重新选择后开始评审。')
      setSelected(selected.filter(engine => available.includes(engine)))
      return
    }
    busyRef.current = true; setBusy(true); setError(null)
    try {
      const input = { sourceMessageId: initial?.id ?? '', material: material.trim(), focus: focus.trim(), engines: selected }
      const requestId = planReviewRequestId(sessionId, input)
      const result = await createPlanReview(sessionId, { ...input, requestId })
      draftBaseline.current = { material, focus }
      queries.setQueryData(['plan-review', sessionId, result.id], result)
      setReviewId(result.id); setComposing(false)
      void history.refetch()
    } catch (failure) {
      setError(`${failure instanceof Error ? failure.message : '提交失败'}。若连接中断，请先查看历史评审；原参数再次提交会复用同一批次。`)
    } finally { busyRef.current = false; setBusy(false) }
  }

  async function change(task: PlanReviewTask, action: 'retry' | 'cancel') {
    if (!reviewId || busyRef.current) return
    busyRef.current = true; setBusy(true); setError(null)
    try {
      const key = `${reviewId}:${task.engine}:${task.attemptId}`
      let requestId = retryIds.current.get(key)
      if (action === 'retry' && !requestId) { requestId = reviewUuid(); retryIds.current.set(key, requestId) }
      const result = await changePlanReview(sessionId, reviewId, task.engine, action, requestId)
      queries.setQueryData(['plan-review', sessionId, reviewId], result)
      void history.refetch()
    } catch (failure) { setError(failure instanceof Error ? failure.message : '操作失败，请刷新核对状态') }
    finally { busyRef.current = false; setBusy(false) }
  }

  function requestClose() {
    if (busy) return
    if (material !== draftBaseline.current.material || focus !== draftBaseline.current.focus) setCloseRequested(true)
    else onClose()
  }

  return <Dialog.Root open onOpenChange={open => { if (!open) requestClose() }}><Dialog.Portal container={portal}>
    <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/40" />
    <Dialog.Content className="fixed inset-2 z-[81] flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-[var(--color-background)] outline-none sm:inset-y-8 sm:left-1/2 sm:w-[min(56rem,calc(100vw-3rem))] sm:-translate-x-1/2"
      onCloseAutoFocus={event => { event.preventDefault(); returnFocus() }}>
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
        <div className="min-w-0 flex-1"><Dialog.Title className="text-base font-semibold">多引擎方案评审</Dialog.Title>
          <Dialog.Description className="text-xs text-[var(--color-muted-foreground)]">独立评审引用文字 · 不改代码 · 不切换当前引擎</Dialog.Description></div>
        <Dialog.Close asChild><Button variant="ghost" className="min-h-11 min-w-11" aria-label="关闭方案评审" disabled={busy}><X className="size-4" /></Button></Dialog.Close>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {closeRequested && <div role="alert" className="space-y-2 border-b pb-3 text-sm"><p>引用材料或关注点尚未提交，关闭后会丢失本次编辑。</p>
          <div className="flex gap-2"><Button variant="outline" className="min-h-11" onClick={() => setCloseRequested(false)}>继续编辑</Button>
            <Button variant="ghost" className="min-h-11" onClick={onClose}>放弃编辑并关闭</Button></div></div>}
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11" variant={composing ? 'secondary' : 'ghost'} disabled={busy} onClick={() => setComposing(true)}>引用材料评审</Button>
          <Button className="min-h-11" variant={!composing ? 'secondary' : 'ghost'} disabled={busy} onClick={() => setComposing(false)}>历史评审{history.data ? `（${history.data.length}）` : ''}</Button>
        </div>
        {error && <p role="alert" className="break-words text-sm text-[var(--color-destructive)]">{error}</p>}
        {history.isError && <div role="alert" className="text-sm"><p>评审列表读取失败：{history.error.message}</p><Button variant="outline" onClick={() => void history.refetch()}>重试读取</Button></div>}
        {composing ? <div className="space-y-4">
          <label className="block space-y-1 text-sm"><span>引用的方案材料</span>
            <textarea aria-label="引用的方案材料" className="min-h-48 w-full rounded-md border bg-transparent p-3" maxLength={100000} value={material} disabled={busy} onChange={e => setMaterial(e.target.value)} />
            <span className="block text-xs text-[var(--color-muted-foreground)]">可删减或粘贴方案原文。不会自动读取完整会话、附件或项目文件。{material.length}/100000 字符</span></label>
          <label className="block space-y-1 text-sm"><span>重点关注（可选）</span>
            <textarea aria-label="重点关注" className="min-h-20 w-full rounded-md border bg-transparent p-3" maxLength={4000} value={focus} disabled={busy} onChange={e => setFocus(e.target.value)} placeholder="例如：权限边界、遗漏场景、实现成本" /></label>
          <fieldset disabled={busy}><legend className="mb-1 text-sm">选择评审引擎</legend>
            <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">{REVIEW_ENGINES.map(engine => <label key={engine} className="flex min-h-11 items-center gap-2 py-1 text-sm">
              <input type="checkbox" checked={selected.includes(engine)} disabled={!available.includes(engine)} onChange={e => setSelected(current => e.target.checked ? [...current, engine] : current.filter(item => item !== engine))} />
              <span>{engineName(engine)}{!available.includes(engine) && <span className="block text-xs text-[var(--color-muted-foreground)]">{REVIEW_ENGINE_LIMITATIONS[engine] || '运行检测未就绪，请在引擎设置中检查安装与登录'}</span>}</span>
            </label>)}</div>
          </fieldset>
          <p className="text-xs text-[var(--color-muted-foreground)]">使用各引擎的原生默认模型，每个所选引擎会单独调用并计费/消耗额度。第一轮互不读取其他意见。</p>
          <Button className="min-h-11" disabled={busy || !material.trim() || material.length > 100000 || !selected.length || history.isError} onClick={() => void submit()}>{busy ? '正在提交…' : `开始评审（${selected.length} 个引擎）`}</Button>
        </div> : <>
          <label className="block space-y-1 text-sm"><span>本会话最近 50 次评审</span><select aria-label="选择评审记录" className="min-h-11 w-full min-w-0 rounded-md border bg-[var(--color-background)] px-2" value={reviewId ?? ''} disabled={busy || history.isError} onChange={e => setReviewId(e.target.value || null)}>
            <option value="">选择评审记录</option>{!history.isError && history.data?.map(item => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString()} · {item.preview.replace(/\s+/g, ' ')}{item.activeCount ? ` · ${item.activeCount} 项进行中` : ''}</option>)}</select></label>
          {history.isPending && <p role="status">正在读取评审记录…</p>}
          {!history.isError && history.data?.length === 0 && <p className="text-sm text-[var(--color-muted-foreground)]">暂无评审。可从方案回复点击「多引擎评审」，或在此粘贴方案原文。</p>}
          {reviewId && detail.isPending && <p role="status">正在读取评审结果…</p>}
          {detail.isError && <div role="alert"><p>结果读取失败：{detail.error.message}</p><Button variant="outline" onClick={() => void detail.refetch()}>重新读取结果</Button></div>}
          {!history.isError && !detail.isError && detail.data && <>
            <details className="border-b pb-3"><summary className="min-h-11 cursor-pointer text-sm">查看本次引用材料与关注点</summary><pre className="whitespace-pre-wrap break-words text-sm">{detail.data.material}</pre><p className="mt-3 text-sm">关注点：{detail.data.focus || '通用方案评审'}</p></details>
            <p className="text-xs text-[var(--color-muted-foreground)]">仅依据以上材料；意见未经项目验证。关闭窗口后任务继续，可从「会话与分享 → 多引擎方案评审」返回。</p>
            {detail.data.tasks.map(task => <section key={task.engine} className="min-w-0 space-y-3 border-b pb-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{engineName(task.engine)} · {labels[task.status]}</h3>
                {(task.status === 'QUEUED' || task.status === 'RUNNING') ? <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void change(task, 'cancel')}>取消 {engineName(task.engine)}</Button>
                  : task.status !== 'SUCCEEDED' && <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void change(task, 'retry')}>重试 {engineName(task.engine)}</Button>}</div>
              <p className="text-xs text-[var(--color-muted-foreground)]">模型：{task.model || '原生默认（尚未报告具体型号）'}</p>
              {task.error && <p className="text-sm">{task.error}</p>}
              {task.status === 'SUCCEEDED' && task.result && <><Markdown text={task.result} className="min-w-0 break-words" />
                <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => { onQuote(reviewQuote(detail.data!, task)); onClose() }}>引用 {engineName(task.engine)} 建议到草稿</Button></>}
            </section>)}
          </>}
        </>}
      </div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}
