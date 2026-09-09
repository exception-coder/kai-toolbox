import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from './cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid = false, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-[var(--control-height)] w-full rounded-[var(--radius-control)] border bg-[var(--color-surface)] px-3 text-sm text-[var(--color-foreground)]',
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

