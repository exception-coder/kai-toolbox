import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import type { PrdStep } from '../types'

const STEP_LABELS = ['填写需求', 'AI 渐进澄清', '生成 / 编辑 PRD']
const BAR_CLASS_NAME = [
  'flex items-center gap-1.5 px-3 py-2 border-b border-[var(--color-border)]',
  'bg-[var(--color-card)] overflow-x-auto whitespace-nowrap md:gap-2 md:px-6 md:py-3',
].join(' ')
const STEP_BUTTON_CLASS_NAME = [
  'w-5 h-5 flex-shrink-0 rounded-full flex items-center justify-center',
  'text-[10px] font-semibold transition-opacity md:w-6 md:h-6 md:text-xs',
].join(' ')

interface StepBarProps {
  step: PrdStep
  onClickStep?: (index: number) => void
  /** 移动端专用前置插槽；桌面端由调用方自行隐藏。 */
  leading?: ReactNode
}

function stepIndex(step: PrdStep): number {
  if (step === 'INPUT') return 0
  if (step === 'CHATTING') return 1
  return 2
}

/** 展示 PRD 主流程步骤，并允许返回已完成的步骤。 */
export function StepBar({ step, onClickStep, leading }: StepBarProps) {
  const active = stepIndex(step)

  return (
    <div className={BAR_CLASS_NAME}>
      {leading}
      {STEP_LABELS.map((label, index) => {
        const clickable = ((index === 0 && active > 0) || (index === 1 && active > 1)) && !!onClickStep
        const clickTitle = index === 0 ? '返回填写需求' : `查看${label}`

        return (
          <div key={label} className="flex items-center gap-1.5 flex-shrink-0 md:gap-2">
            <button
              type="button"
              onClick={() => clickable && onClickStep?.(index)}
              disabled={!clickable}
              title={clickable ? clickTitle : undefined}
              className={`${STEP_BUTTON_CLASS_NAME}
                ${index <= active
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'}
                ${clickable
                  ? 'cursor-pointer hover:opacity-80 ring-2 ring-[var(--color-primary)]/30'
                  : 'cursor-default'}`}
            >
              {index + 1}
            </button>
            <span
              onClick={() => clickable && onClickStep?.(index)}
              className={[
                'text-xs md:text-sm',
                index === active ? 'font-medium' : 'text-[var(--color-muted-foreground)]',
                clickable ? 'cursor-pointer hover:text-[var(--color-foreground)]' : '',
              ].join(' ')}
            >
              {label}
              {clickable && <span className="ml-1 text-[10px] text-[var(--color-primary)] opacity-70">↩</span>}
            </span>
            {index < STEP_LABELS.length - 1 && (
              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-[var(--color-muted-foreground)] md:w-4 md:h-4" />
            )}
          </div>
        )
      })}
    </div>
  )
}
