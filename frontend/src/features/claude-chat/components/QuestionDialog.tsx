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

/** Other 选项的内部哨兵 label；提交时替换成用户自定义文本，不会回传 "__other__"。 */
const OTHER = '__other__'

/** AskUserQuestion 可视化弹窗：单选/多选，末尾带 Other 自定义输入（都不合适时自己写）。 */
export function QuestionDialog({ questions, onSubmit, onCancel }: Props) {
  // 每个问题的当前选择：单选存 string，多选存 string[]
  const [picks, setPicks] = useState<Record<string, string | string[]>>({})
  // 每个问题的 Other 自定义文本
  const [otherText, setOtherText] = useState<Record<string, string>>({})

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
    const has = Array.isArray(v) ? v.length > 0 : !!v
    if (!has) return false
    // 选了 Other 必须填了文本才算已答
    if (isPicked(q, OTHER) && !(otherText[q.question] ?? '').trim()) return false
    return true
  })

  const submit = () => {
    const answers: Record<string, string | string[]> = {}
    for (const q of questions) {
      const v = picks[q.question]
      const custom = (otherText[q.question] ?? '').trim()
      if (Array.isArray(v)) {
        answers[q.question] = v.map(l => (l === OTHER ? custom : l)).filter(Boolean)
      } else {
        answers[q.question] = v === OTHER ? custom : v
      }
    }
    onSubmit(answers)
  }

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

              {/* Other：都不合适时自己写 */}
              <button
                type="button"
                onClick={() => toggle(q, OTHER)}
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                  isPicked(q, OTHER)
                    ? 'border-[var(--color-primary)] bg-[var(--color-accent)]'
                    : 'border-[var(--color-border)]',
                )}
              >
                <div className="text-sm font-medium">其它（自定义）</div>
                <div className="text-xs text-[var(--color-muted-foreground)]">都不合适？选这里写下你的想法</div>
              </button>
              {isPicked(q, OTHER) && (
                <textarea
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  className="w-full resize-none rounded-lg border border-[var(--color-primary)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none ring-1 ring-[var(--color-primary)]"
                  rows={2}
                  placeholder="写下你的想法…（提交前必填）"
                  value={otherText[q.question] ?? ''}
                  onChange={e => setOtherText(prev => ({ ...prev, [q.question]: e.target.value }))}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-3">
        <Button variant="outline" size="lg" className="flex-1" onClick={onCancel}>
          取消
        </Button>
        <Button size="lg" className="flex-1 shadow-md" disabled={!allAnswered} onClick={submit}>
          提交
        </Button>
      </div>
    </Overlay>
  )
}
