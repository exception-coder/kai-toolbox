import { useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw, Upload } from 'lucide-react'
import type { GitPushActions, GitPushPreview } from './types'

export function GitPushToolbar({ actions, repo, onPending, onPushed }: {
  actions: GitPushActions; repo?: string; onPending: (pending: boolean) => void; onPushed: () => void
}) {
  const callbacks = useRef({ actions, onPending, onPushed })
  callbacks.current = { actions, onPending, onPushed }
  const [preview, setPreview] = useState<GitPushPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [failed, setFailed] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const generation = useRef(0)

  async function refresh() {
    const current = ++generation.current
    setLoading(true)
    setPreview(null)
    setPreviewError('')
    setConfirming(false)
    try {
      const result = await callbacks.current.actions.preview(repo)
      if (current === generation.current) setPreview(result)
    } catch (error) {
      if (current === generation.current) setPreviewError(error instanceof Error ? error.message : String(error))
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }

  useEffect(() => {
    setFeedback('')
    void refresh()
    return () => { generation.current++ }
    // Repository identity owns this preview; callbacks may be recreated by the host.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo])

  async function push() {
    if (!preview || pending) return
    setPending(true)
    callbacks.current.onPending(true)
    setFeedback('')
    try {
      const result = await callbacks.current.actions.push(preview.token, repo)
      setFailed(false)
      setFeedback(result.message)
      callbacks.current.onPushed()
    } catch (error) {
      setFailed(true)
      setFeedback(`${error instanceof Error ? error.message : String(error)}。请先刷新核对远端状态，再决定重试。`)
    } finally {
      setPending(false)
      callbacks.current.onPending(false)
      await refresh()
    }
  }

  return <section aria-label="推送当前分支" className="space-y-2 border-b px-3 py-3">
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1 text-xs">
        {loading ? '读取推送目标…' : preview ? <>
          <div className="break-all font-medium">{preview.branch || '未处于分支'} → {preview.remote ? `${preview.remote}/${preview.targetBranch}` : '未配置上游'}</div>
          <div className="mt-1 text-[var(--color-muted-foreground)]">{preview.ahead != null && `待推送 ${preview.ahead} 个提交`}{preview.behind ? ` · 落后 ${preview.behind} 个提交` : ''}</div>
        </> : '推送目标暂不可用'}
      </div>
      <button type="button" onClick={() => void refresh()} disabled={pending || loading} aria-label="刷新推送状态" className="inline-flex size-9 items-center justify-center rounded-md border disabled:opacity-50"><RefreshCw className="size-4" /></button>
      <button type="button" onClick={() => setConfirming(true)} disabled={!preview || !!preview.pushBlockedReason || pending || loading || confirming} className="inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium disabled:opacity-50"><Upload className="size-4" />推送</button>
    </div>
    {preview?.pushBlockedReason && <p className="text-xs text-[var(--color-muted-foreground)]">{preview.pushBlockedReason}</p>}
    {previewError && <p role="alert" className="break-words text-xs text-[var(--color-destructive)]">状态刷新失败：{previewError}。可使用刷新按钮重试。</p>}
    {confirming && preview && <div className="space-y-2 text-xs">
      <p className="break-all">将推送当前分支全部待推送提交，截止 {preview.head.slice(0, 8)}。未提交文件不会发送。</p>
      {preview.destinations.map(destination => <p key={destination} className="break-all text-[var(--color-muted-foreground)]">{destination}</p>)}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void push()} disabled={pending} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--color-primary)] px-3 text-xs text-[var(--color-primary-foreground)] disabled:opacity-50">{pending && <Loader2 className="size-4 animate-spin" />}{pending ? '推送中，请等待…' : '确认推送'}</button>
        <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="min-h-10 rounded-md border px-3 text-xs disabled:opacity-50">取消</button>
      </div>
    </div>}
    {feedback && <p role={failed ? 'alert' : 'status'} className={`break-words text-xs ${failed ? 'text-[var(--color-destructive)]' : 'text-[var(--color-muted-foreground)]'}`}>{feedback}</p>}
  </section>
}
