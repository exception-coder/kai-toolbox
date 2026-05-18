import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface PromptOptions {
  title?: React.ReactNode
  description?: React.ReactNode
  placeholder?: string
  defaultValue?: string
  confirmText?: string
  cancelText?: string
  /** 返回 string 表示错误信息；返回 null/undefined 表示通过。 */
  validate?: (value: string) => string | null | undefined
}

type PromptFn = (opts: PromptOptions | string) => Promise<string | null>

const PromptContext = React.createContext<PromptFn | null>(null)

export function usePrompt(): PromptFn {
  const ctx = React.useContext(PromptContext)
  if (!ctx) throw new Error('usePrompt 必须在 <PromptProvider> 内调用')
  return ctx
}

interface Pending {
  options: PromptOptions
  resolve: (value: string | null) => void
}

export function PromptProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<Pending | null>(null)
  const [value, setValue] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const prompt = React.useCallback<PromptFn>(opts => {
    const options: PromptOptions =
      typeof opts === 'string' ? { description: opts } : opts
    setValue(options.defaultValue ?? '')
    setError(null)
    return new Promise<string | null>(resolve => {
      setPending({ options, resolve })
    })
  }, [])

  const finish = (val: string | null) => {
    pending?.resolve(val)
    setPending(null)
    setValue('')
    setError(null)
  }

  const handleConfirm = () => {
    if (!pending) return
    const trimmed = value.trim()
    const validate = pending.options.validate
    if (validate) {
      const err = validate(trimmed)
      if (err) { setError(err); return }
    }
    finish(trimmed.length ? trimmed : null)
  }

  // 弹出时让 input 聚焦 + 全选
  React.useEffect(() => {
    if (pending) {
      // 等 Radix Portal 挂载后再 focus
      const id = window.setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 30)
      return () => window.clearTimeout(id)
    }
  }, [pending])

  const opts = pending?.options

  return (
    <PromptContext.Provider value={prompt}>
      {children}
      <DialogPrimitive.Root
        open={!!pending}
        onOpenChange={open => { if (!open) finish(null) }}
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
              'fixed left-1/2 top-1/2 z-50 w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2',
              'rounded-lg border bg-[var(--color-card)] text-[var(--color-card-foreground)] shadow-lg',
              'p-5 transition-all duration-150',
              'data-[state=closed]:scale-95 data-[state=closed]:opacity-0',
              'data-[state=open]:scale-100 data-[state=open]:opacity-100',
              'focus:outline-none',
            )}
            onEscapeKeyDown={() => finish(null)}
          >
            <div className="space-y-1.5">
              <DialogPrimitive.Title className="text-base font-semibold">
                {opts?.title ?? '请输入'}
              </DialogPrimitive.Title>
              {opts?.description && (
                <DialogPrimitive.Description className="text-sm text-[var(--color-muted-foreground)]">
                  {opts.description}
                </DialogPrimitive.Description>
              )}
            </div>
            <div className="mt-4">
              <Input
                ref={inputRef}
                value={value}
                onChange={e => { setValue(e.target.value); if (error) setError(null) }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleConfirm() }
                }}
                placeholder={opts?.placeholder}
              />
              {error && (
                <div className="mt-1.5 text-xs text-[var(--color-destructive)]">{error}</div>
              )}
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => finish(null)}>
                {opts?.cancelText ?? '取消'}
              </Button>
              <Button size="sm" onClick={handleConfirm}>
                {opts?.confirmText ?? '确定'}
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </PromptContext.Provider>
  )
}
