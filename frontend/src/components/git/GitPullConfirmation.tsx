import { Loader2 } from 'lucide-react'
import type { GitPullPreview } from './types'

export function GitPullConfirmation({ preview, pending, onConfirm, onCancel }: {
  preview: GitPullPreview; pending: boolean; onConfirm: () => void; onCancel: () => void
}) {
  return <div className="space-y-2 text-xs" aria-label="拉取更新确认">
    <p className="break-all font-medium">{preview.remote}/{preview.targetBranch} → {preview.branch}</p>
    <p className="break-all text-[var(--color-muted-foreground)]">{preview.source}</p>
    <p>已检查远端：待拉取 {preview.behind} 个提交 · 本地领先 {preview.ahead} 个提交</p>
    <p className="break-all">{preview.head.slice(0, 8)} → {preview.upstreamHead.slice(0, 8)}</p>
    <p>仅快进更新当前目录，请先停止正在修改该仓库的 Agent 或本机 Git 操作。不会自动暂存、覆盖本地改动或处理分叉。</p>
    {preview.pullBlockedReason && <p role="status">{preview.pullBlockedReason}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={pending || !!preview.pullBlockedReason} onClick={onConfirm}
        className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--color-primary)] px-3 text-xs text-[var(--color-primary-foreground)] disabled:opacity-50">
        {pending && <Loader2 className="size-4 animate-spin" />}{pending ? '拉取中，请等待…' : '确认拉取'}
      </button>
      <button type="button" disabled={pending} onClick={onCancel} className="min-h-10 rounded-md border px-3 disabled:opacity-50">取消拉取</button>
    </div>
  </div>
}
