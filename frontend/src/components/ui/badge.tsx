import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-[var(--color-primary)] text-[var(--color-primary-foreground)]',
        secondary:
          'border-transparent bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)]',
        destructive:
          'border-transparent bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)]',
        outline: 'text-[var(--color-foreground)]',
        // 语义状态：走 index.css 状态令牌，自动适配明暗/护眼，不再硬编码 emerald
        success:
          'border-transparent bg-[var(--color-success-soft)] text-[var(--color-success-soft-foreground)]',
        info:
          'border-transparent bg-[var(--color-info-soft)] text-[var(--color-info-soft-foreground)]',
        warning:
          'border-transparent bg-[var(--color-warning-soft)] text-[var(--color-warning-soft-foreground)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}
