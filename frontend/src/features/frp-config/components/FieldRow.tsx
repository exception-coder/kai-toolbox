import { type ReactNode } from 'react'

interface Props {
  label: string
  hint?: string
  required?: boolean
  children: ReactNode
}

/** label + hint + control 的左右布局，宽度可自适应 */
export function FieldRow({ label, hint, required, children }: Props) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[160px_1fr] sm:items-start sm:gap-3">
      <div className="pt-2">
        <div className="text-sm font-medium">
          {label}
          {required && <span className="ml-1 text-[var(--color-destructive)]">*</span>}
        </div>
        {hint && (
          <div className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{hint}</div>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
