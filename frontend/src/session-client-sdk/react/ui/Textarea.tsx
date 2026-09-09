import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from './cn'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid = false, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'min-h-24 w-full resize-y rounded-[var(--radius-control)] border bg-[var(--color-surface)] px-3 py-2 text-sm leading-6 text-[var(--color-foreground)]',
        'border-[var(--color-border-strong)] placeholder:text-[var(--color-muted)]',
        'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--color-focus)]',
        'disabled:cursor-not-allowed disabled:bg-[var(--color-surface-subtle)] disabled:opacity-60',
        invalid && 'border-[var(--color-danger)]',
        className,
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
})

