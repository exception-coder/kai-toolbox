import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const variants: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary-hover)]',
  secondary: 'border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-foreground)] hover:bg-[var(--color-surface-subtle)]',
  ghost: 'border-transparent bg-transparent text-[var(--color-secondary)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-foreground)]',
  danger: 'border-transparent bg-[var(--color-danger)] text-white hover:opacity-90',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, disabled, children, ...props },
  ref,
) {
  return (
    <button
      type="button"
      ref={ref}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] border font-medium transition-[background-color,border-color,opacity] duration-150',
        'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--color-focus)]',
        'disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-[var(--control-height-sm)] px-3 text-xs' : 'h-[var(--control-height)] px-4 text-sm',
        variants[variant],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
      {children}
    </button>
  )
})
