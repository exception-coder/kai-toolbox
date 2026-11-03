import { lazy, Suspense, useId, useRef, useState } from 'react'
import { NotebookPen } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { useMobileViewport } from '../../hooks/useMobileViewport'
import { useWorkspaceDockPosition } from '../../hooks/useWorkspaceDockPosition'
import type { CommunicationReference } from '../../api/communicationJournal'

const Workspace = lazy(() => import('./SessionCommunicationWorkspace'))

/** 只承载会话待办入口，编辑、权限和引用仍由原工作区负责。 */
export function SessionCommunicationDock(props: {
  sessionId: string; sessionTitle: string; readOnly: boolean
  onReference: (sessionId: string, material: CommunicationReference) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  const mobile = useMobileViewport()
  const placement = useWorkspaceDockPosition('communication-entry', 0.28)
  return <Sheet open={open} onOpenChange={setOpen}>
    <button ref={trigger} type="button" aria-label="打开开发待办" aria-expanded={open}
      aria-haspopup="dialog" aria-controls={open ? id : undefined} data-focus-chrome
      style={{ top: placement.style.top, right: 'env(safe-area-inset-right, 0px)' }}
      className="fixed z-30 flex h-11 w-7 flex-col items-center justify-center gap-0.5 rounded-l-lg border bg-[var(--color-background)] text-[var(--color-primary)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
      title="开发待办" onClick={() => setOpen(true)}>
      <NotebookPen className="size-4" aria-hidden="true" />
    </button>
    <SheetContent id={id} side={mobile ? 'bottom' : 'right'} hideCloseButton
      className={mobile ? 'flex h-auto min-h-0 flex-col rounded-t-xl p-0' : 'flex min-h-0 w-full flex-col p-0 sm:max-w-xl'}
      style={mobile ? { bottom: placement.bottomInset, maxHeight: Math.min(placement.visibleHeight - 16, placement.visibleHeight * 0.8) } : undefined}
      onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus() }}>
      <SheetTitle className="sr-only">开发待办</SheetTitle>
      <SheetDescription className="sr-only">查看当前会话记录的需求，新增待办或引用到对话草稿。</SheetDescription>
      <Suspense fallback={<p role="status" className="p-4 text-sm">正在加载待办…</p>}>
        <Workspace {...props} onClose={() => setOpen(false)} />
      </Suspense>
    </SheetContent>
  </Sheet>
}
