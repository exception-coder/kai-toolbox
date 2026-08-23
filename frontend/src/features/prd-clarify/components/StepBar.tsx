import type { ReactNode } from 'react'
import type { PrdStep } from '../types'

const STEP_LABELS = ['想法', '探索', '成型']
const BAR_CLASS_NAME = [
  'flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2.5',
  'bg-[var(--color-card)] overflow-x-auto whitespace-nowrap md:px-6',
].join(' ')

interface StepBarProps {
  step: PrdStep
  onClickStep?: (index: number) => void
  /** 移动端专用前置插槽；桌面端由调用方自行隐藏。 */
  leading?: ReactNode
}

function stepIndex(step: PrdStep): number {
  if (step === 'INPUT') return 0
  if (step === 'DISCOVERING' || step === 'SPEC_REVIEW') return 1
  return 2
}

/** 展示 PRD 主流程步骤，并允许返回已完成的步骤。 */
export function StepBar({ step, onClickStep, leading }: StepBarProps) {
  const active = stepIndex(step)

  return (
    <div className={BAR_CLASS_NAME}>
      {leading}
      {STEP_LABELS.map((label, index) => {
        const clickable = index < active && index < 2 && !!onClickStep
        const clickTitle = index === 0 ? '返回需求输入' : `查看${label}`

        return (
          <div key={label} className="flex flex-shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => clickable && onClickStep?.(index)}
              disabled={!clickable}
              title={clickable ? clickTitle : undefined}
              className={`group inline-flex items-center gap-2 rounded-md py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] ${
                index === active
                  ? 'font-semibold text-[var(--color-foreground)]'
                  : index < active
                    ? 'text-[var(--color-muted-foreground)]'
                    : 'text-[var(--color-muted-foreground)]/55'
              } ${clickable ? 'cursor-pointer hover:text-[var(--color-foreground)]' : 'cursor-default'}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${
                index <= active ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border-strong)]'
              }`} />
              {label}
            </button>
            {index < STEP_LABELS.length - 1 && (
              <span className={`h-px w-8 md:w-12 ${index < active ? 'bg-[var(--color-primary)]/45' : 'bg-[var(--color-border)]'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
