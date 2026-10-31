import { useEffect, useState } from 'react'
import { Download, Loader2, RefreshCw, Upload } from 'lucide-react'
import type { GitPullActions, GitPushActions, GitWorkspaceStatus } from './types'
import { useGitPull } from './useGitPull'
import { useGitPush } from './useGitPush'
import { GitPullConfirmation } from './GitPullConfirmation'

export function GitPushToolbar({ actions, pullActions, repo, onPending, onPushed, onPulled, workspace, refreshKey, refreshing, onRefresh, onShowChanges, onShowHistory }: {
  actions: GitPushActions; pullActions?: GitPullActions; repo?: string; onPending: (pending: boolean) => void
  onPushed: () => void; onPulled?: () => void
  workspace?: GitWorkspaceStatus | null; refreshKey?: number; refreshing?: boolean; onRefresh?: () => void
  onShowChanges?: () => void; onShowHistory?: () => void
}) {
  const { preview, loading, pending, confirming, setConfirming, feedback, setFeedback, failed, previewError, refresh, push }
    = useGitPush({ actions, repo, onPending, onPushed, refreshKey })
  const pull = useGitPull({ actions: pullActions, repo, onPending, onPulled: () => { (onPulled ?? onPushed)(); void refresh() } })
  const busy = pending || pull.pending

  const [fresh, setFresh] = useState(false)
  useEffect(() => {
    const remaining = workspace?.remoteChecked ? Date.parse(workspace.checkedAt) + 5 * 60_000 - Date.now() : 0
    setFresh(remaining > 0)
    const timer = setTimeout(() => setFresh(false), Math.max(0, remaining))
    return () => clearTimeout(timer)
  }, [workspace])
  const ahead = workspace?.ahead ?? preview?.ahead
  const behind = workspace?.behind ?? preview?.behind
  const upstream = workspace ? workspace.upstream : preview?.remote ? `${preview.remote}/${preview.targetBranch}` : ''
  const state = loading && !workspace ? '读取同步状态…' : previewError && !workspace ? '同步状态未知' : !upstream ? '未关联远程分支' : ahead == null || behind == null ? '同步状态未知'
    : ahead > 0 && behind > 0 ? '分支已分叉' : ahead > 0 ? `待推送 ${ahead} 个提交` : behind > 0 ? `待拉取 ${behind} 个提交`
    : fresh ? '已同步' : '本地记录一致 · 远端未核对'
  return <section aria-label={pullActions ? "同步当前分支" : "推送当前分支"} className="space-y-2 border-b px-4 py-3">
    <div className="text-sm font-medium" role="status">{refreshing ? '正在核对远端…' : state}</div>
    {upstream && <div className="break-all text-[13px] text-[var(--color-muted-foreground)]">远程跟踪 {upstream} · 待推送 {ahead ?? '未知'} · 待拉取 {behind ?? '未知'}</div>}
    {workspace && <p className="break-words text-[13px] text-[var(--color-muted-foreground)]">{workspace.notice}{fresh ? ` · ${new Date(workspace.checkedAt).toLocaleTimeString()} 核对` : ''}</p>}
    {!upstream && !loading && <details className="text-[13px] text-[var(--color-muted-foreground)]"><summary className="min-h-11 cursor-pointer py-3">设置跟踪分支</summary>
      <p>先在“选择分支”中复制目标远程分支名称，在本机终端进入此仓库，执行以下命令后刷新状态；请将占位内容替换为实际名称。</p>
      <code className="mt-2 block break-all">git branch --set-upstream-to=远端名/分支名 当前分支名</code>
    </details>}
    {!!workspace?.changes && <button type="button" disabled={busy} onClick={onShowChanges} className="min-h-11 text-[13px] underline">有本地修改 · {workspace.changes} 项{onShowChanges ? ' · 查看修改' : ''}</button>}
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => onRefresh ? onRefresh() : void refresh()} disabled={busy || loading || refreshing || !!pull.preview || confirming} className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border px-3 text-[13px] disabled:opacity-50"><RefreshCw className="size-4" />刷新状态</button>
      {pullActions && !!upstream && (!!behind || behind == null) && !(ahead && behind) && <button type="button" onClick={() => { setFeedback(''); void pull.prepare() }} disabled={busy || confirming || !!pull.preview || refreshing}
        className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border px-3 text-[13px] font-medium disabled:opacity-50">
        {pull.pending && !pull.preview ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{pull.pending && !pull.preview ? '检查更新中…' : '拉取更新'}
      </button>}
      {!!upstream && !!ahead && !behind && <button type="button" onClick={() => setConfirming(true)} disabled={!preview || !!preview.pushBlockedReason || busy || loading || confirming || !!pull.preview || refreshing} className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border px-3 text-[13px] font-medium disabled:opacity-50"><Upload className="size-4" />推送</button>}
      {!!ahead && !!behind && <button type="button" disabled={busy} onClick={onShowHistory} className="min-h-11 rounded-md border px-3 text-[13px]">查看分支提交</button>}
    </div>
    {!!ahead && !!behind && <p className="text-[13px]">请先对比分支提交，在本机 Git 中选择合并或 rebase；不会自动处理分叉。</p>}
    {preview?.pushBlockedReason && <p className="text-[13px] text-[var(--color-muted-foreground)]">{preview.pushBlockedReason}</p>}
    {previewError && <p role="alert" className="break-words text-[13px] text-[var(--color-destructive)]">状态刷新失败：{previewError}。可使用刷新按钮重试。</p>}
    {pull.preview && <GitPullConfirmation preview={pull.preview} pending={pull.pending} onConfirm={() => void pull.pull()}
      onCancel={() => { pull.dismiss(); void refresh() }} />}
    {pull.feedback && <p role={pull.failed ? 'alert' : 'status'} className={`break-words text-[13px] ${pull.failed ? 'text-[var(--color-destructive)]' : 'text-[var(--color-muted-foreground)]'}`}>{pull.feedback}</p>}
    {confirming && preview && <div className="space-y-2 text-[13px]">
      <p className="break-all">将推送当前分支全部待推送提交，截止 {preview.head.slice(0, 8)}。未提交文件不会发送。</p>
      {preview.destinations.map(destination => <p key={destination} className="break-all text-[var(--color-muted-foreground)]">{destination}</p>)}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void push()} disabled={pending} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--color-primary)] px-3 text-[13px] text-[var(--color-primary-foreground)] disabled:opacity-50">{pending && <Loader2 className="size-4 animate-spin" />}{pending ? '推送中，请等待…' : '确认推送'}</button>
        <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="min-h-10 rounded-md border px-3 text-[13px] disabled:opacity-50">取消</button>
      </div>
    </div>}
    {feedback && <p role={failed ? 'alert' : 'status'} className={`break-words text-[13px] ${failed ? 'text-[var(--color-destructive)]' : 'text-[var(--color-muted-foreground)]'}`}>{feedback}</p>}
  </section>
}
