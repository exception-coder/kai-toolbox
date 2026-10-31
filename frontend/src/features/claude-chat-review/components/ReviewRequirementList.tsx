import { useEffect, useRef, useState } from 'react'
import { Check, ClipboardList, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Markdown, useMobileViewport, type PublicReviewDelivery, type PublicReviewRequirement } from '@/features/claude-chat/public-api'
import type { useReviewRequirements } from '../hooks/useReviewRequirements'
import { parseRequirementContent, writeRequirementContent, type RequirementContent } from '../lib/requirementContent'
import { ReviewHandoffProgress } from './ReviewHandoffProgress'

interface Props {
  open: boolean; onOpenChange: (open: boolean) => void
  token: string
  backlog: ReturnType<typeof useReviewRequirements>
  delivery?: PublicReviewDelivery; deliveryError: string | null; onRetryDelivery: () => void
  submitting: boolean; submitError: string | null; onSubmit: (items: PublicReviewRequirement[]) => Promise<boolean>
  onShowSource: (source: string) => void; onCloseFocus: () => void
}
export function ReviewRequirementList({ open, onOpenChange, token, backlog, delivery, deliveryError, onRetryDelivery,
  submitting, submitError, onSubmit, onShowSource, onCloseFocus }: Props) {
  const mobile = useMobileViewport()
  const [editing, setEditing] = useState<PublicReviewRequirement | null>(null)
  const [title, setTitle] = useState('')
  const [fields, setFields] = useState<RequirementContent>({ kind: '需求', problem: '', expected: '', acceptance: '' })
  const [mergeSourceId, setMergeSourceId] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [notice, setNotice] = useState('')
  const previewPanel = useRef<HTMLElement>(null)
  useEffect(() => { if (preview) requestAnimationFrame(() => previewPanel.current?.scrollIntoView?.({ block: 'nearest' })) }, [preview])
  const delivered = new Set(delivery?.tasks.map(task => `${task.requirementId}:${task.sourceRevision}`))
  const confirmed = backlog.items.filter(item => item.confirmed && !delivered.has(`${item.id}:${item.revision}`))
  const busy = backlog.busy || backlog.loading || submitting
  const beginEdit = (item: PublicReviewRequirement) => {
    setEditing(item); setTitle(item.title); setFields(parseRequirementContent(item.content, item.sources?.[0]?.sourceText)); setMergeSourceId(''); setPreview(false)
  }
  const save = async () => {
    if (!editing) return
    const source = backlog.items.find(item => item.id === mergeSourceId)
    const content = writeRequirementContent(fields) + (source ? `\n\n## 合并补充\n${source.content}` : '')
    const ok = source ? await backlog.merge(editing, source, title, content) : await backlog.save(editing, title, content)
    if (ok) { setEditing(null); setNotice('内容已保存，请重新确认当前版本。') }
  }
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side={mobile ? 'bottom' : 'right'} hideCloseButton onCloseAutoFocus={event => { event.preventDefault(); onCloseFocus() }}
      className={`review-backlog review-sheet flex flex-col p-0 ${mobile ? 'h-[88dvh] max-h-[100dvh] rounded-t-xl' : 'w-[38rem] max-w-[95vw]'}`}>
      <header className="flex min-h-12 shrink-0 items-center gap-2 border-b px-4">
        <ClipboardList className="size-4" /><SheetTitle className="flex-1 text-base">需求清单 · {backlog.items.length} 项</SheetTitle>
        <button type="button" aria-label="关闭需求清单" className="inline-flex size-11 items-center justify-center" onClick={() => onOpenChange(false)}><X className="size-5" /></button>
      </header>
      <SheetDescription className="shrink-0 px-4 py-2 text-xs">先加入、再确认，最后交给原会话规划执行。</SheetDescription>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {(backlog.error || (!preview && submitError) || deliveryError) && <p role="alert" className="mb-2 text-sm text-[var(--color-destructive)]">{backlog.error || (!preview && submitError) || deliveryError} <button className="min-h-11 underline" onClick={() => { if (deliveryError) onRetryDelivery(); void backlog.reload() }}>{deliveryError ? '刷新交付记录' : '刷新清单'}</button></p>}
        {notice && <p role="status" className="py-2 text-xs">{notice}</p>}
        {backlog.loading && <p className="py-3 text-sm">正在读取需求清单…</p>}
        {!backlog.loading && backlog.items.length === 0 && <p className="py-4 text-sm text-[var(--color-muted-foreground)]">清单还没有需求。可继续讨论，再从下方候选主动加入。</p>}
        <ol className="divide-y">
          {backlog.items.map(item => <li key={item.id} className="py-3">
            <div className="flex items-start justify-between gap-3"><h3 className="break-words text-sm font-medium">{item.title}</h3><span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">{item.confirmed ? '已确认' : '待确认'}</span></div>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{parseRequirementContent(item.content).kind} · 第 {item.revision} 版{delivered.has(`${item.id}:${item.revision}`) ? ' · 已提交开发' : delivery?.tasks.some(task => task.requirementId === item.id) ? ' · 补充版本，尚未提交' : ''}</p>
            {delivered.has(`${item.id}:${item.revision}`) && <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">撤销确认或移除不取消原会话任务；调整后须以新版本提交。</p>}
            {editing?.id === item.id ? <form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); void save() }}>
              <label className="block text-xs">需求标题<input autoFocus aria-label="需求标题" value={title} maxLength={120} onChange={event => setTitle(event.target.value)} className="review-field mt-1" /></label>
              <label className="block text-xs">类型<select value={fields.kind} onChange={event => setFields(previous => ({ ...previous, kind: event.target.value }))} className="review-field mt-1">{['需求', '新增', '修复', '优化', ...(!['需求', '新增', '修复', '优化'].includes(fields.kind) ? [fields.kind] : [])].map(kind => <option key={kind}>{kind}</option>)}</select></label>
              {(['problem', 'expected', 'acceptance'] as const).map((field, index) => <label key={field} className="block text-xs">{['问题', '预期行为', '验收标准'][index]}<textarea aria-label={['问题', '预期行为', '验收标准'][index]} rows={3} maxLength={2800} value={fields[field]} onChange={event => setFields(previous => ({ ...previous, [field]: event.target.value }))} className="review-field mt-1 resize-y" /></label>)}
              {backlog.items.length > 1 && <label className="block text-xs">合并其他需求 · 可选<select value={mergeSourceId} onChange={event => setMergeSourceId(event.target.value)} className="review-field mt-1"><option value="">不合并</option>{backlog.items.filter(other => other.id !== item.id).map(other => <option key={other.id} value={other.id}>{other.title}</option>)}</select><span className="mt-1 block text-[var(--color-muted-foreground)]">合并会保留双方来源，生成待确认的新版本；已提交快照不变。</span></label>}
              <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(null)}>取消编辑</Button><Button type="submit" size="sm" className="min-h-11" disabled={busy || !title.trim() || !fields.problem.trim() || !fields.expected.trim() || !fields.acceptance.trim()}>{mergeSourceId ? '确认合并并保存' : '保存修改'}</Button></div>
            </form> : <>
              <details className="mt-2 text-sm"><summary className="min-h-9 cursor-pointer py-1 text-xs">查看需求与验收</summary><Markdown text={item.content} className="mt-2 text-sm" />
                <p className="mt-2 break-all text-xs text-[var(--color-muted-foreground)]">需求 ID：{item.id}</p>
                {(item.sources ?? []).map(source => <details key={source.sourceMessageId} className="mt-2 border-t pt-2"><summary className="cursor-pointer text-xs">来源依据</summary><p className="mt-2 whitespace-pre-wrap text-sm">{source.sourceText || '此历史条目未保留原文'}</p><button type="button" className="min-h-11 text-xs underline" onClick={() => onShowSource(source.sourceMessageId)}>查看原始消息与截图</button></details>)}
              </details>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <Button size="sm" variant={item.confirmed ? 'ghost' : 'outline'} className="min-h-11" disabled={busy || (!item.confirmed && (!parseRequirementContent(item.content).expected.trim() || !parseRequirementContent(item.content).acceptance.trim()))} onClick={() => void backlog.confirm(item, !item.confirmed)}>{item.confirmed ? '撤销确认' : <><Check className="mr-1 size-3.5" />确认需求</>}</Button>
                <Button size="sm" variant="ghost" className="min-h-11" disabled={busy} onClick={() => beginEdit(item)}>编辑 / 合并</Button>
                <Button size="sm" variant="ghost" className="ml-auto min-h-11" disabled={busy} onClick={() => { if (removing !== item.id) setRemoving(item.id); else void backlog.remove(item).then(ok => { if (ok) setRemoving(null) }) }}>{removing === item.id ? '确认移除' : '移除'}</Button>
              </div>
            </>}
          </li>)}
        </ol>
        {backlog.candidates.length > 0 && <section className="mt-4 border-t pt-3"><h3 className="text-sm font-medium">讨论候选 · {backlog.candidates.length}</h3><p className="mt-1 text-xs text-[var(--color-muted-foreground)]">仅供选择，尚未加入需求清单。</p><ul className="divide-y">{backlog.candidates.map(candidate => <li key={candidate.sourceMessageId} className="py-3"><p className="text-sm font-medium">{candidate.title}</p>{backlog.items.some(item => item.title.trim() === candidate.title.trim()) && <p className="mt-1 text-xs">已有同名需求，加入后可显式合并，原内容不会自动覆盖。</p>}<details className="mt-1 text-xs"><summary className="cursor-pointer py-1">查看建议</summary><Markdown text={candidate.content} className="text-sm" /></details><div className="flex justify-end gap-2"><button className="min-h-11 text-xs underline" onClick={() => onShowSource(candidate.sourceMessageId)}>查看来源</button><Button size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={() => void backlog.add(candidate)}>加入清单</Button></div></li>)}</ul></section>}
        <ReviewHandoffProgress token={token} delivery={delivery} error={deliveryError} onRetry={onRetryDelivery} requirements={backlog.items} />
        {preview && <section ref={previewPanel} className="mt-4 border-t py-3" aria-label="提交开发确认"><h3 className="text-sm font-medium">确认提交开发</h3>{submitError && <p role="alert" className="my-2 text-xs text-[var(--color-destructive)]">{submitError}</p>}<p className="mt-2 text-sm">目标项目：{delivery?.targetProject ?? '正在核对'}</p><p className="mt-1 text-xs">仅提交以下 {confirmed.length} 项已确认版本；原会话仍需确认执行。</p><ul className="my-2 list-inside list-disc text-sm">{confirmed.map(item => <li key={item.id}>{item.title} · 第 {item.revision} 版</li>)}</ul><div className="flex justify-end gap-2"><Button size="sm" variant="ghost" disabled={submitting} onClick={() => setPreview(false)}>返回清单</Button><Button size="sm" className="min-h-11" disabled={busy || confirmed.length === 0 || !delivery?.targetProject} onClick={() => void onSubmit(confirmed).then(ok => { if (ok) { setPreview(false); setNotice('已登记原会话评审待办，可查看交付进度。') } })}>{submitting ? '提交中…' : '确认提交开发'}</Button></div></section>}
      </div>
      <footer className="review-sheet-footer flex shrink-0 items-center justify-between gap-3 border-t px-4 py-3"><span className="text-xs text-[var(--color-muted-foreground)]">待确认 {backlog.items.filter(item => !item.confirmed).length} · 可提交 {confirmed.length}</span>{!preview && <Button disabled={busy || !!editing || confirmed.length === 0 || !delivery?.targetProject || !!deliveryError} onClick={() => setPreview(true)} className="min-h-11">{busy && <Loader2 className="mr-1 size-4 animate-spin" />}提交已确认需求{confirmed.length > 0 ? `（${confirmed.length}）` : ''}</Button>}</footer>
    </SheetContent>
  </Sheet>
}
