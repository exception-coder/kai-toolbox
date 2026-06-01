import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ListChecks } from 'lucide-react'
import type { Question } from '../types'
import { Overlay } from './PermissionDialog'

interface Props {
  questions: Question[]
  onSubmit: (answers: Record<string, string | string[]>) => void
  onCancel: () => void
}

/** AskUserQuestion 可视化弹窗：单选/多选。 */
export function QuestionDialog({ questions, onSubmit, onCancel }: Props) {
  // 每个问题的当前选择：单选存 string，多选存 string[]
  const [picks, setPicks] = useState<Record<string, string | string[]>>({})

  const toggle = (q: Question, label: string) => {
    setPicks(prev => {
      if (q.multiSelect) {
        const cur = Array.isArray(prev[q.question]) ? (prev[q.question] as string[]) : []
        return {
          ...prev,
          [q.question]: cur.includes(label) ? cur.filter(l => l !== label) : [...cur, label],
        }
      }
      return { ...prev, [q.question]: label }
    })
  }

  const isPicked = (q: Question, label: string) => {
    const v = picks[q.question]
    return Array.isArray(v) ? v.includes(label) : v === label
  }

  const allAnswered = questions.every(q => {
    const v = picks[q.question]
    return Array.isArray(v) ? v.length > 0 : !!v
  })

  return (
    <Overlay>
      <div className="mb-3 flex items-center gap-2">
        <ListChecks className="size-5 text-[var(--color-primary)]" />
        <h3 className="text-base font-semibold">Claude 想确认</h3>
      </div>
      <div className="max-h-[60vh] space-y-4 overflow-y-auto">
        {questions.map(q => (
          <div key={q.question}>
            <p className="mb-2 text-sm font-medium">{q.question}</p>
            <div className="space-y-2">
              {q.options.map(opt => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => toggle(q, opt.label)}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                    isPicked(q, opt.label)
                      ? 'border-[var(--color-primary)] bg-[var(--color-accent)]'
                      : 'border-[var(--color-border)]',
                  )}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  {opt.description && (
                    <div className="text-xs text-[var(--color-muted-foreground)]">{opt.description}</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-3">
        <Button variant="outline" size="lg" className="flex-1" onClick={onCancel}>
          取消
        </Button>
        <Button size="lg" className="flex-1 shadow-md" disabled={!allAnswered} onClick={() => onSubmit(picks)}>
          提交
        </Button>
      </div>
    </Overlay>
  )
}
