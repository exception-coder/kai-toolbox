import { useEffect, useRef, useState } from 'react'
import { getPublicReviewSubmission, Markdown, reviewTodoStatusLabel, type PublicReviewDelivery } from '@/features/claude-chat/public-api'

export function ReviewHandoffProgress({ token, delivery, error, onRetry, requirements }: {
  token: string
  delivery?: PublicReviewDelivery; error: string | null; onRetry: () => void
  requirements: Array<{ id: string; title: string }>
}) {
  return <details className="mt-4 border-t py-3 text-xs">
    <summary className="min-h-9 cursor-pointer py-1 font-medium">交付与执行进度 · {delivery?.tasks.length ?? 0} 项</summary>
    {error && <p role="alert">{error} <button className="min-h-11 underline" onClick={onRetry}>重试读取交付记录</button></p>}
    {!delivery && !error && <p className="py-2">正在核对目标项目与交付记录…</p>}
    {delivery && <><p className="py-2 text-[var(--color-muted-foreground)]">目标项目：{delivery.targetProject}。提交只登记待办，原会话确认后执行。</p>
      <ul className="divide-y">{delivery.tasks.map(task => <li key={task.id} className="flex justify-between gap-3 py-2"><span>{requirements.find(item => item.id === task.requirementId)?.title ?? '已提交历史需求'} · 第 {task.sourceRevision} 版</span><span className="shrink-0">{reviewTodoStatusLabel[task.status]}</span></li>)}</ul>
      {delivery.submissions.length > 0 && <div className="mt-3"><p className="font-medium">最近交付记录 · 最多 50 次</p>{delivery.submissions.map(record => <SubmissionRecord key={record.id} token={token} record={record} />)}</div>}
    </>}
  </details>
}

function SubmissionRecord({ token, record }: { token: string; record: PublicReviewDelivery['submissions'][number] }) {
  const [content, setContent] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const load = async () => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const result = await getPublicReviewSubmission(token, record.id)
      if (alive.current) setContent(result.content ?? '')
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : '读取原文失败，可重试') }
    finally { if (alive.current) setBusy(false) }
  }
  return <details className="mt-2 border-t py-2"><summary className="cursor-pointer leading-5">{new Date(record.createdAt).toLocaleString('zh-CN')} · {record.targetProject}</summary><p className="my-2 break-all">提交 ID：{record.id}<br />提交人：{record.submittedBy}</p>
    {error && <p role="alert">{error}</p>}
    {content == null ? <button className="min-h-11 underline" disabled={busy} onClick={() => void load()}>{busy ? '读取中…' : '查看提交时原文'}</button> : <Markdown text={content} className="text-xs" />}
  </details>
}
