import { lazy, Suspense, useId, useRef, useState } from 'react'
import { NotebookPen, X } from 'lucide-react'
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
  const referencing = useRef(false)
  const id = useId()
  const mobile = useMobileViewport()
  const placement = useWorkspaceDockPosition('communication-entry', 0.28)
  return <Sheet open={open} onOpenChange={setOpen}>
    <button ref={trigger} type="button" aria-label="打开开发待办" aria-expanded={open}
      aria-haspopup="dialog" aria-controls={open ? id : undefined} data-focus-chrome
      style={{ top: placement.style.top, right: 'env(safe-area-inset-right, 0px)' }}
      className="fixed z-30 flex h-12 w-11 flex-col items-center justify-center gap-0.5 rounded-l-lg border bg-[var(--color-background)] text-[var(--color-primary)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
      onClick={() => { referencing.current = false; setOpen(true) }}>
      <NotebookPen className="size-4" aria-hidden="true" /><span className="text-[10px]">待办</span>
    </button>
    <SheetContent id={id} side={mobile ? 'bottom' : 'right'} hideCloseButton
      className={mobile ? 'flex h-[80dvh] min-h-0 flex-col rounded-t-xl p-0' : 'flex min-h-0 w-full flex-col p-0 sm:max-w-xl'}
      style={mobile ? { bottom: placement.bottomInset, maxHeight: placement.visibleHeight - 16 } : undefined}
      onCloseAutoFocus={event => { event.preventDefault(); if (!referencing.current) trigger.current?.focus() }}>
      <div className="flex shrink-0 items-center justify-between border-b px-4">
        <SheetTitle className="text-sm">当前会话待办</SheetTitle>
        <button type="button" aria-label="关闭开发待办" className="flex size-11 items-center justify-center" onClick={() => setOpen(false)}><X className="size-4" /></button>
      </div>
      <SheetDescription className="sr-only">查看当前会话记录的需求，新增待办或引用到对话草稿。</SheetDescription>
      <Suspense fallback={<p role="status" className="p-4 text-sm">正在加载待办…</p>}>
        <Workspace {...props} onReference={async (sessionId, material) => {
          await props.onReference(sessionId, material)
          referencing.current = true
          setOpen(false)
        }} />
      </Suspense>
    </SheetContent>
  </Sheet>
}
