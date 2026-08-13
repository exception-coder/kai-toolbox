import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, GitPullRequestArrow, Loader2, Paperclip, Send, ShieldCheck, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MessageList, getPublicReview, submitPublicReviewFeedback, uploadReviewAttachment, useClaudeChatSocket, type SendAttachment } from '@/features/claude-chat/public-api'

export function ReviewPage() {
  const { token = '' } = useParams()
  const chat = useClaudeChatSocket({ channel: 'review', reviewToken: token })
  const [review, setReview] = useState<Awaited<ReturnType<typeof getPublicReview>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<SendAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [submittingFeedback, setSubmittingFeedback] = useState(false)
  const [submittedMessageId, setSubmittedMessageId] = useState<string | null>(null)
  const attachedRef = useRef<string | null>(null)

  useEffect(() => {
    void getPublicReview(token).then(setReview).catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [token])
  useEffect(() => {
    if (!review || attachedRef.current === review.reviewSessionId) return
    attachedRef.current = review.reviewSessionId
    chat.switchTo(review.reviewSessionId)
  }, [review, chat.switchTo])

  const send = () => {
    if ((!text.trim() && attachments.length === 0) || chat.running) return
    chat.send(text, attachments)
    setText(''); setAttachments([])
  }
  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true); setError(null)
    try {
      const next: SendAttachment[] = []
      for (const file of Array.from(files).slice(0, 10 - attachments.length)) {
        const uploaded = await uploadReviewAttachment(token, file)
        next.push({ ...uploaded, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined })
      }
      setAttachments(prev => [...prev, ...next])
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setUploading(false) }
  }

  const latestConclusion = [...chat.items].reverse().find(item => item.kind === 'assistant')
  const submitConclusion = async () => {
    if (!latestConclusion || latestConclusion.kind !== 'assistant' || submittingFeedback) return
    setSubmittingFeedback(true); setError(null)
    try {
      await submitPublicReviewFeedback(token, latestConclusion.text, latestConclusion.id)
      setSubmittedMessageId(latestConclusion.id)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSubmittingFeedback(false) }
  }

  if (error && !review) return <CenteredError message={error} />
  if (!review) return <div className="flex h-dvh items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" />加载评审会话…</div>

  return (
    <div className="flex h-dvh flex-col bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <header className="border-b bg-white/90 px-4 py-3 backdrop-blur dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600"><ShieldCheck className="size-5" /></div>
          <div className="min-w-0 flex-1"><h1 className="truncate font-semibold">{review.title}</h1><p className="text-xs text-slate-500">关联开发会话：{review.sourceTitle} · {review.mode === 'FULL_FORK' ? '完整上下文' : '安全快照'} · 仅评审</p></div>
          <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">Review only</span>
        </div>
      </header>
      {review.contextSnapshot && <details className="mx-auto w-full max-w-5xl border-b px-4 py-2 text-xs"><summary className="cursor-pointer text-slate-500">查看分享的需求/计划快照</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-3 dark:bg-slate-900">{review.contextSnapshot}</pre></details>}
      {error && <div className="mx-auto mt-2 flex w-full max-w-5xl gap-2 px-4 text-sm text-red-600"><AlertTriangle className="size-4" />{error}</div>}
      <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 overflow-hidden">
        <MessageList items={chat.items} running={chat.running} sessionKey={review.reviewSessionId} engineLabel="AI 评审" connState={chat.state} onLoadEarlier={() => chat.loadHistory(false)} loadingEarlier={chat.historyLoading} exhausted={chat.historyExhausted} />
      </main>
      <footer className="border-t bg-white p-3 dark:bg-slate-900">
        <div className="mx-auto max-w-5xl">
          {latestConclusion && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100">
              <span className="min-w-0 flex-1">评审结论将登记到“{review.sourceTitle}”的待处理意见，不会自动执行编码。</span>
              <Button size="sm" variant="outline" onClick={() => void submitConclusion()} disabled={submittingFeedback || submittedMessageId === latestConclusion.id} className="shrink-0 gap-1.5">
                {submittedMessageId === latestConclusion.id ? <CheckCircle2 className="size-4" /> : submittingFeedback ? <Loader2 className="size-4 animate-spin" /> : <GitPullRequestArrow className="size-4" />}
                {submittedMessageId === latestConclusion.id ? '已提交开发侧' : '提交最新结论'}
              </Button>
            </div>
          )}
          {attachments.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{attachments.map(a => <span key={a.path} className="rounded-md bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{a.name}</span>)}</div>}
          <div className="flex items-end gap-2 rounded-2xl border bg-white p-2 shadow-sm dark:bg-slate-950">
            <label className="cursor-pointer rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" title="上传问题截图或文档"><input className="sr-only" type="file" multiple disabled={uploading || chat.running} onChange={e => void upload(e.target.files)} />{uploading ? <Loader2 className="size-5 animate-spin" /> : <Paperclip className="size-5" />}</label>
            <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} rows={2} disabled={chat.running} placeholder="补充业务规则、测试场景或上传问题附件…" className="max-h-36 min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none disabled:opacity-60" />
            {chat.running ? <Button size="icon" variant="destructive" onClick={chat.interrupt} title="中断回答"><Square className="size-4" /></Button> : <Button size="icon" onClick={send} disabled={!text.trim() && attachments.length === 0}><Send className="size-4" /></Button>}
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-500">此页面不能切换模型、权限或项目；提交结论后由开发者在来源会话确认实施。</p>
        </div>
      </footer>
    </div>
  )
}

function CenteredError({ message }: { message: string }) {
  return <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center"><AlertTriangle className="size-8 text-amber-500" /><h1 className="font-semibold">无法打开评审链接</h1><p className="text-sm text-slate-500">{message}</p></div>
}
