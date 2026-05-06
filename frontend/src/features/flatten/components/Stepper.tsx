import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type StepKey = 'scan' | 'dedupe' | 'move'
export type StepState = 'pending' | 'active' | 'done'

interface Step {
  key: StepKey
  label: string
  state: StepState
}

interface StepperProps {
  steps: Step[]
}

export function Stepper({ steps }: StepperProps) {
  return (
    <ol className="flex items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          <div
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full border text-xs font-medium',
              s.state === 'done' && 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
              s.state === 'active' && 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]',
              s.state === 'pending' && 'border-[var(--color-border)] text-[var(--color-muted-foreground)]',
            )}
          >
            {s.state === 'done' ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </div>
          <span
            className={cn(
              'whitespace-nowrap',
              s.state === 'pending' && 'text-[var(--color-muted-foreground)]',
              s.state === 'active' && 'font-medium',
            )}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <div className={cn('mx-2 h-px w-10', s.state === 'done' ? 'bg-emerald-500/40' : 'bg-[var(--color-border)]')} />
          )}
        </li>
      ))}
    </ol>
  )
}
