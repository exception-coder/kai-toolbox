import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import { setRecentSessionsExpanded, useRecentSessionsExpanded } from '../lib/workspacePreferences'

export function WorkspacePreferences({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const expanded = useRecentSessionsExpanded()
  const [error, setError] = useState(false)
  const portal = useFullscreenPortalContainer()
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal container={portal}>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
    <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-5">
      <Dialog.Title className="text-base font-semibold">工作区个性化</Dialog.Title>
      <Dialog.Description className="mt-2 text-xs text-[var(--color-muted-foreground)]">保存在当前浏览器，重新打开页面后仍生效，不修改项目或其他同事的设置。</Dialog.Description>
      <label className="mt-5 flex min-h-11 items-center justify-between gap-4 text-sm">
        <span>最近会话默认状态</span>
        <select aria-label="最近会话默认状态" value={String(expanded)} className="min-h-11 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3"
          onChange={event => {
            try { setRecentSessionsExpanded(event.target.value === 'true'); setError(false) } catch { setError(true) }
          }}>
          <option value="true">展开</option><option value="false">折叠</option>
        </select>
      </label>
      <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">修改立即应用；仍可点击“最近会话”标题临时展开或收起。</p>
      {error && <p role="alert" className="mt-3 text-xs text-amber-700">浏览器未允许保存，设置未更改。请允许本地存储后重试。</p>}
      <div className="mt-4 flex justify-end"><Dialog.Close className="min-h-11 rounded-md border border-[var(--color-border)] px-4 text-sm">完成</Dialog.Close></div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}
