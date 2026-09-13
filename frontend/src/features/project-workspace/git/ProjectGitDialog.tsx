import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { GitBranch, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import type { RegistryProject } from '../registry/types'
import { ProjectGitWorkspace } from './ProjectGitWorkspace'

/** Git 操作依附当前项目，弹框关闭后仍回到原列表入口。 */
export function ProjectGitDialog({ project }: { project: RegistryProject }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const title = useRef<HTMLHeadingElement>(null)
  const portalContainer = useFullscreenPortalContainer()
  return <Dialog.Root open={open} onOpenChange={value => { if (!busy) setOpen(value) }}>
    <Dialog.Trigger asChild>
      <Button variant="outline" size="sm" className="shrink-0" aria-label={`Git 操作：${project.metadata.name}`}>
        <GitBranch className="size-4" />Git
      </Button>
    </Dialog.Trigger>
    <Dialog.Portal container={portalContainer}>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] shadow-lg focus:outline-none"
        aria-describedby={undefined}
        onOpenAutoFocus={event => { event.preventDefault(); title.current?.focus() }}
        onEscapeKeyDown={event => { if (busy) event.preventDefault() }}
        onInteractOutside={event => { if (busy) event.preventDefault() }}>
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-border)] p-4 sm:px-6">
          <div className="min-w-0">
            <Dialog.Title ref={title} tabIndex={-1} className="text-base font-semibold outline-none">{project.metadata.name} · Git 操作</Dialog.Title>
            <p className="mt-1 break-all text-xs text-[var(--color-muted-foreground)]">{project.metadata.localPath}</p>
          </div>
          <Dialog.Close asChild><Button variant="ghost" size="icon" className="size-8 shrink-0" disabled={busy} aria-label="关闭 Git 操作"><X className="size-4" /></Button></Dialog.Close>
        </header>
        {busy && <p role="status" className="px-4 pt-3 text-sm sm:px-6">推送进行中，请等待结果后关闭。</p>}
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <ProjectGitWorkspace key={project.id} project={project} onBusyChange={setBusy} />
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
