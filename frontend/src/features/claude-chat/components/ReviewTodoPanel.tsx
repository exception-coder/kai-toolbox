import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { confirmReviewTodos, editReviewTodo, listReviewTodos, type ReviewTodo } from '../api'
import { reviewTodoStatusLabel } from '../lib/reviewTodoStatus'
import { Button } from '@/components/ui/button'

/** 所选项带上阅读时的版本，后台刷新不能把新内容默认为已经批准。 */
export function ReviewTodoPanel({ sourceSessionId, onChanged }: { sourceSessionId: string; onChanged: () => void }) {
  const client = useQueryClient()
  const key = ['claude-chat-review-todos', sourceSessionId]
  const query = useQuery({ queryKey: key, queryFn: () => listReviewTodos(sourceSessionId), refetchInterval: 10_000 })
  const [selected, setSelected] = useState<Record<string, number>>({})
  const [merge, setMerge] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<ReviewTodo | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const editTrigger = useRef<HTMLButtonElement | null>(null)
  const tasks = query.data ?? []
  const waiting = tasks.filter(task => task.status === 'WAITING')
  const selectedCount = Object.keys(selected).length
  const closeEdit = () => { setEditing(null); requestAnimationFrame(() => editTrigger.current?.focus()) }
  const save = async () => {
    if (!editing || busy) return
    setBusy(true); setError(null)
    try {
      const result = await editReviewTodo(sourceSessionId, editing, title, content)
      client.setQueryData<ReviewTodo[]>(key, current => current?.map(task => task.id === result.id ? result : task))
      setSelected(current => { const next = { ...current }; delete next[result.id]; return next })
      closeEdit()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败，草稿已保留') }
    finally { setBusy(false) }
  }
  const confirm = async () => {
    if (busy || !selectedCount) return
    setBusy(true); setError(null); setNotice('')
    try {
      const result = await confirmReviewTodos(sourceSessionId, Object.entries(selected).map(([id, version]) => ({ id, version })), merge)
      client.setQueryData(key, result)
      setNotice(`${selectedCount} 项已确认并登记执行队列；当前忙碌时将按顺序继续。`)
      setSelected({}); onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '确认结果未明，请刷新核对，勿重复创建')
      void query.refetch()
    } finally { setBusy(false) }
  }
  return <section className="border-b px-3 py-3" aria-label="原会话评审待办">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-medium">评审待办{tasks.length ? ` · ${waiting.length} 项待确认` : ''}</h2>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void query.refetch()}>刷新待办</Button>
    </div>
    <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">结合实际规划选择、修订并确认。确认后复用原会话队列，保留现有任务和权限。</p>
    {(error || query.error) && <p role="alert" className="mt-2 break-words text-xs text-[var(--color-destructive)]">{error ?? query.error?.message}</p>}
    {notice && <p role="status" className="mt-2 text-xs">{notice}</p>}
    {query.isLoading && <p className="py-3 text-xs">正在读取评审待办…</p>}
    {!query.isLoading && !query.error && tasks.length === 0 && <p className="py-3 text-xs text-[var(--color-muted-foreground)]">尚无已提交的评审需求。</p>}
    <ul className="mt-2 divide-y">
      {tasks.map(task => <li key={task.id} className="py-3">
        <div className="flex items-start gap-2">
          {task.status === 'WAITING' && <label className="inline-flex min-h-11 min-w-8 items-start justify-center pt-1">
            <input type="checkbox" aria-label={`选择 ${task.title}`} disabled={busy || !!editing} checked={selected[task.id] != null}
              onChange={event => setSelected(current => { const next = { ...current }; if (event.target.checked) next[task.id] = task.version; else delete next[task.id]; return next })} />
          </label>}
          <details className="min-w-0 flex-1">
            <summary className="cursor-pointer break-words text-sm font-medium">{task.title}</summary>
            <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed">{task.content}</p>
            <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">来源需求第 {task.sourceRevision} 版 · 待办 {task.id}</p>
          </details>
          <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">{reviewTodoStatusLabel[task.status]}</span>
        </div>
        {task.note && <p className="mt-1 break-words text-xs text-[var(--color-muted-foreground)]">{task.note}</p>}
        {task.status === 'EXCEPTION' && <p className="mt-1 text-xs">请在原会话运行状态中核对并恢复队列；此处不会重复发起任务。</p>}
        {task.status === 'WAITING' && <Button size="sm" variant="ghost" disabled={busy || !!editing} onClick={event => {
          editTrigger.current = event.currentTarget; setEditing(task); setTitle(task.title); setContent(task.content); setError(null)
        }}>调整待办</Button>}
        {editing?.id === task.id && <form className="mt-2 space-y-2" onSubmit={event => { event.preventDefault(); void save() }}>
          <label className="block text-xs">待办标题<input autoFocus value={title} maxLength={120} onChange={event => setTitle(event.target.value)} className="mt-1 block min-h-10 w-full rounded-md border bg-transparent px-2" /></label>
          <label className="block text-xs">需求及验收条件<textarea value={content} onChange={event => setContent(event.target.value)} rows={6} className="mt-1 block w-full rounded-md border bg-transparent p-2" /></label>
          <div className="flex gap-2"><Button type="submit" size="sm" disabled={busy || !title.trim() || !content.trim()}>保存待办</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={closeEdit}>取消编辑</Button></div>
        </form>}
      </li>)}
    </ul>
    {waiting.length > 0 && <div className="sticky bottom-0 mt-2 flex flex-wrap items-center gap-2 border-t bg-[var(--color-background)] py-2">
      <Button size="sm" variant="ghost" disabled={busy || !!editing} onClick={() => setSelected(Object.fromEntries(waiting.map(task => [task.id, task.version])))}>全选待确认</Button>
      <label className="inline-flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={merge} disabled={busy} onChange={event => setMerge(event.target.checked)} />合并为一项执行</label>
      <Button className="ml-auto min-h-11" disabled={busy || !!editing || !selectedCount} onClick={() => void confirm()}>{busy ? '正在处理…' : `确认并执行${selectedCount ? `（${selectedCount}）` : ''}`}</Button>
    </div>}
  </section>
}
