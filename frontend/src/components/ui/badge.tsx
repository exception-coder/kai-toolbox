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
        success:
          'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
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
