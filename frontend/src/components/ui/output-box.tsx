import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

interface OutputBoxProps {
  label: string
  value: string
  error?: string | null
  rows?: number
  monospace?: boolean
}

export function OutputBox({ label, value, error, rows = 6, monospace = true }: OutputBoxProps) {
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* 用户拒绝剪贴板权限时静默失败 */
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-[var(--color-muted-foreground)]">{label}</label>
        <button
          type="button"
          onClick={onCopy}
          disabled={!value}
          className={cn(
            'inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
            value
              ? 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]'
              : 'cursor-not-allowed opacity-50',
          )}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <textarea
        readOnly
        value={error ? '' : value}
        rows={rows}
        className={cn(
          'w-full resize-y rounded-md border bg-[var(--color-muted)] px-3 py-2 text-sm shadow-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
          monospace && 'font-mono',
          error && 'border-[var(--color-destructive)]',
        )}
      />
      {error && <p className="text-xs text-[var(--color-destructive)]">{error}</p>}
    </div>
  )
}
