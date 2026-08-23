import { useEffect, useRef } from 'react'
import { FileCode2, Loader2, RotateCw, X } from 'lucide-react'

interface Props {
  path: string
  tool: 'claude' | 'codex'
  phase: 'checking' | 'confirming' | 'initializing' | 'error'
  message: string
  detail?: string
  onConfirm: () => void
  onRetry: () => void
  onClose: () => void
}

/** OpenSpec 缺失时的可恢复确认层；初始化授权不委托给 Agent 自行决定。 */
export function OpenSpecInitializationDialog({
  path,
  tool,
  phase,
  message,
  detail,
  onConfirm,
  onRetry,
  onClose,
}: Props) {
  const primaryActionRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const busy = phase === 'checking' || phase === 'initializing'

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    primaryActionRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [busy, onClose])

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-5" role="presentation">
      <section
        ref={dialogRef}
        aria-describedby="openspec-init-description"
        aria-labelledby="openspec-init-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <FileCode2 className="mt-0.5 size-4 shrink-0 text-[var(--color-primary)]" />
            <div className="min-w-0">
              <h2 id="openspec-init-title" className="text-sm font-semibold">初始化 OpenSpec</h2>
              <p id="openspec-init-description" className="mt-1 text-xs leading-5 text-[var(--color-muted-foreground)]">
                当前项目尚未建立规格根目录。初始化完成后，平台会继续刚才的规格同步任务。
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="关闭 OpenSpec 初始化"
            disabled={busy}
            onClick={onClose}
            className="rounded-md p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          <div>
            <p className="text-xs font-medium text-[var(--color-muted-foreground)]">目标项目</p>
            <p className="mt-1 break-all font-mono text-xs leading-5">{path}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--color-muted-foreground)]">将执行</p>
            <code className="mt-1 block overflow-x-auto rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/35 px-3 py-2 text-xs">
              openspec init . --tools {tool}
            </code>
          </div>
          {phase === 'error' && (
            <div aria-live="polite" className="border-l-2 border-[var(--color-destructive)] pl-3">
              <p className="text-xs font-medium text-[var(--color-destructive)]">{message}</p>
              {detail && <p className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-[var(--color-muted-foreground)]">{detail}</p>}
            </div>
          )}
          {busy && (
            <p aria-live="polite" className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
              <Loader2 className="size-3.5 animate-spin" />
              {phase === 'checking' ? '正在重新检测 OpenSpec root…' : '正在初始化并复核 OpenSpec root…'}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-40"
          >
            暂不初始化
          </button>
          {phase === 'error' ? (
            <button
              ref={primaryActionRef}
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
            >
              <RotateCw className="size-3.5" />重新检测
            </button>
          ) : (
            <button
              ref={primaryActionRef}
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50"
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              {phase === 'checking' ? '正在检测' : busy ? '正在初始化' : '确认并初始化'}
            </button>
          )}
        </footer>
      </section>
    </div>
  )
}
