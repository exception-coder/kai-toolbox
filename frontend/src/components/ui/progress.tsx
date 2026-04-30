import * as React from 'react'
import { cn } from '@/lib/utils'

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
  indeterminate?: boolean
}

export function Progress({ value = 0, indeterminate, className, ...props }: ProgressProps) {
  return (
    <div
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-[var(--color-secondary)]',
        className
      )}
      {...props}
    >
      {indeterminate ? (
        <div className="absolute inset-y-0 w-1/3 animate-[progress-indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-[var(--color-primary)]" />
      ) : (
        <div
          className="h-full bg-[var(--color-primary)] transition-[width] duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      )}
      <style>{`
        @keyframes progress-indeterminate {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(150%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </div>
  )
}
