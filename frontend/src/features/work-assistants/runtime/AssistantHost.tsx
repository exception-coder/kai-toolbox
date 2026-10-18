import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Bot } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { usePermission } from '@/shell/permission'
import { useAuth } from '@/lib/auth'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useConfirm } from '@/components/ui/confirm-dialog'

const Workspace = lazy(() => import('../components/AssistantWorkspace').then(module => ({ default: module.AssistantWorkspace })))
const Context = createContext<(assistant?: string, session?: string) => void>(() => {})
export const useAssistantLauncher = () => useContext(Context)
export interface AssistantMemory { sessionId?: string; assistantId?: string; drafts: Record<string, string>; selectionVersion?: number }

/** Shell 只常驻入口和选择状态；打开时才加载助理工作区，不激活编码聊天。 */
export function AssistantHost({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const allowed = usePermission('menu:work-assistants')
  if (!user || !allowed) return children
  return <AuthorizedAssistantHost key={user.userId} userId={user.userId}>{children}</AuthorizedAssistantHost>
}

function AuthorizedAssistantHost({ children, userId }: { children: ReactNode; userId: number }) {
  const confirm = useConfirm()
  const [secureDirty, setSecureDirty] = useState(false), [secureBusy, setSecureBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [activated, setActivated] = useState(false)
  const [selection, setSelection] = useState<{ assistant?: string; session?: string; revision: number }>({ revision: 0 })
  const trigger = useRef<HTMLElement | null>(null)
  const memory = useRef<AssistantMemory>({ drafts: {} })
  const launch = useCallback((assistant?: string, session?: string) => {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setSelection(current => ({ assistant, session, revision: current.revision + 1 }))
    if (assistant || session) memory.current.selectionVersion = (memory.current.selectionVersion || 0) + 1
    setActivated(true); setOpen(true)
  }, [])
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.code === 'KeyA') { event.preventDefault(); launch() }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [launch])
  return <Context.Provider value={launch}>{children}
    <>
      <button type="button" onClick={() => launch()} className="fixed right-3 top-1/2 z-30 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm shadow-sm focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]" aria-label="唤醒工作助理" aria-keyshortcuts="Alt+Shift+A" title="工作助理 · Alt+Shift+A">
        <Bot className="size-5 text-[var(--color-primary)]" /><span className="sr-only">工作助理</span>
      </button>
      <Sheet open={open} onOpenChange={next => {
        if (next) { setOpen(true); return }
        if (secureBusy) return
        if (!secureDirty) { setOpen(false); return }
        void confirm({ title: '清除未保存的登记信息？', description: '关闭会清除本次表单及密码，尚未写入资源中心。', confirmText: '清除并关闭' }).then(accepted => { if (accepted) setOpen(false) })
      }}>
        <SheetContent side="right" onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus() }} className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <SheetTitle className="shrink-0 border-b px-6 py-4 text-base">工作助理</SheetTitle>
          {activated && <ErrorBoundary compact label="work-assistants"><Suspense fallback={<div role="status" className="space-y-4 p-6"><div className="h-12 animate-pulse rounded bg-[var(--color-muted)]" /><div className="h-28 animate-pulse rounded bg-[var(--color-muted)]" /><p className="text-sm">正在连接助理，可随时关闭后重试…</p></div>}>
            <Workspace key={userId} selection={selection} memory={memory.current} onSecureDirtyChange={setSecureDirty} onSecureBusyChange={setSecureBusy} />
          </Suspense></ErrorBoundary>}
        </SheetContent>
      </Sheet>
    </>
  </Context.Provider>
}
