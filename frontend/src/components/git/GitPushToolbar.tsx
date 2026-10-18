import { Download, Loader2, RefreshCw, Upload } from 'lucide-react'
import type { GitPullActions, GitPushActions } from './types'
import { useGitPull } from './useGitPull'
import { useGitPush } from './useGitPush'
import { GitPullConfirmation } from './GitPullConfirmation'

export function GitPushToolbar({ actions, pullActions, repo, onPending, onPushed, onPulled }: {
  actions: GitPushActions; pullActions?: GitPullActions; repo?: string; onPending: (pending: boolean) => void
  onPushed: () => void; onPulled?: () => void
}) {
  const { preview, loading, pending, confirming, setConfirming, feedback, setFeedback, failed, previewError, refresh, push }
    = useGitPush({ actions, repo, onPending, onPushed })
  const pull = useGitPull({ actions: pullActions, repo, onPending, onPulled: () => { (onPulled ?? onPushed)(); void refresh() } })
  const busy = pending || pull.pending

  return <section aria-label={pullActions ? "同步当前分支" : "推送当前分支"} className="space-y-2 border-b px-3 py-3">
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1 text-xs">
        {loading ? '读取推送目标…' : preview ? <>
          <div className="break-all font-medium">{preview.branch || '未处于分支'} → {preview.remote ? `${preview.remote}/${preview.targetBranch}` : '未配置上游'}</div>
          <div className="mt-1 text-[var(--color-muted-foreground)]">{preview.ahead != null && `待推送 ${preview.ahead} 个提交`}{preview.behind ? ` · 落后 ${preview.behind} 个提交` : ''}</div>
        </> : '推送目标暂不可用'}
      </div>
      <button type="button" onClick={() => void refresh()} disabled={busy || loading || !!pull.preview} aria-label="刷新推送状态" className="inline-flex size-9 items-center justify-center rounded-md border disabled:opacity-50"><RefreshCw className="size-4" /></button>
      {pullActions && <button type="button" onClick={() => { setFeedback(''); void pull.prepare() }} disabled={busy || confirming || !!pull.preview}
        className="inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium disabled:opacity-50">
        {pull.pending && !pull.preview ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{pull.pending && !pull.preview ? '检查更新中…' : '拉取更新'}
      </button>}
      <button type="button" onClick={() => setConfirming(true)} disabled={!preview || !!preview.pushBlockedReason || busy || loading || confirming || !!pull.preview} className="inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium disabled:opacity-50"><Upload className="size-4" />推送</button>
    </div>
    {preview?.pushBlockedReason && <p className="text-xs text-[var(--color-muted-foreground)]">{preview.pushBlockedReason}</p>}
    {previewError && <p role="alert" className="break-words text-xs text-[var(--color-destructive)]">状态刷新失败：{previewError}。可使用刷新按钮重试。</p>}
    {pull.preview && <GitPullConfirmation preview={pull.preview} pending={pull.pending} onConfirm={() => void pull.pull()}
      onCancel={() => { pull.dismiss(); void refresh() }} />}
    {pull.feedback && <p role={pull.failed ? 'alert' : 'status'} className={`break-words text-xs ${pull.failed ? 'text-[var(--color-destructive)]' : 'text-[var(--color-muted-foreground)]'}`}>{pull.feedback}</p>}
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
