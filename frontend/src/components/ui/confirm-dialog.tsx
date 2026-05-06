import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ConfirmOptions {
  title?: React.ReactNode
  description?: React.ReactNode
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive'
}

type ConfirmFn = (opts: ConfirmOptions | string) => Promise<boolean>

const ConfirmContext = React.createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm 必须在 <ConfirmProvider> 内调用')
  return ctx
}

interface PendingConfirm {
  options: ConfirmOptions
  resolve: (ok: boolean) => void
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<PendingConfirm | null>(null)

  const confirm = React.useCallback<ConfirmFn>(opts => {
    const options: ConfirmOptions =
      typeof opts === 'string' ? { description: opts } : opts
    return new Promise<boolean>(resolve => {
      setPending({ options, resolve })
    })
  }, [])

  const handleResolve = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }

  const opts = pending?.options
  const variant = opts?.variant ?? 'default'
  const isDestructive = variant === 'destructive'

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <DialogPrimitive.Root
        open={!!pending}
        onOpenChange={open => {
          if (!open) handleResolve(false)
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className={cn(
              'fixed inset-0 z-50 bg-black/50 transition-opacity duration-150',
              'data-[state=closed]:opacity-0 data-[state=open]:opacity-100',
            )}
          />
          <DialogPrimitive.Content
            className={cn(
              'fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2',
              'rounded-lg border bg-[var(--color-card)] text-[var(--color-card-foreground)] shadow-lg',
              'p-5 transition-all duration-150',
              'data-[state=closed]:scale-95 data-[state=closed]:opacity-0',
              'data-[state=open]:scale-100 data-[state=open]:opacity-100',
              'focus:outline-none',
            )}
            onEscapeKeyDown={() => handleResolve(false)}
          >
            <div className="flex items-start gap-3">
              {isDestructive && (
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]">
                  <AlertTriangle className="h-5 w-5" />
                </span>
              )}
              <div className="min-w-0 flex-1 space-y-1.5">
                <DialogPrimitive.Title className="text-base font-semibold">
                  {opts?.title ?? (isDestructive ? '确认操作' : '请确认')}
                </DialogPrimitive.Title>
                {opts?.description && (
                  <DialogPrimitive.Description className="text-sm text-[var(--color-muted-foreground)]">
                    {opts.description}
                  </DialogPrimitive.Description>
                )}
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => handleResolve(false)}>
                {opts?.cancelText ?? '取消'}
              </Button>
              <Button
                variant={isDestructive ? 'destructive' : 'default'}
                size="sm"
                onClick={() => handleResolve(true)}
                autoFocus
              >
                {opts?.confirmText ?? '确认'}
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </ConfirmContext.Provider>
  )
}
