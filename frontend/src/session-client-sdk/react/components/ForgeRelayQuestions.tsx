import { useId, useState } from 'react'
import { Button, CheckboxGroup, Input } from '../ui'
import type { RelayQuestion } from '../model/forgeRelayState'

export function ForgeRelayQuestions({ question, disabled, onAnswer }: {
  question: RelayQuestion; disabled: boolean; onAnswer: (answers: Record<string, unknown>) => void
}) {
  const questionId = useId()
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const complete = question.questions.every(item => {
    const answer = answers[item.question]
    return Array.isArray(answer) ? answer.length > 0 : Boolean(answer?.trim())
  })
  return <section className="space-y-4 border-y border-[var(--color-border)] py-4" aria-label="待确认问题">
    <h3 className="font-medium">需要你确认</h3>
    {question.questions.map((item, index) => <div key={item.question} className="space-y-2">
      {item.multiSelect && item.options?.length ? <CheckboxGroup label={item.question}
        options={item.options.map(option => ({ label: option.label, value: option.label }))}
        value={Array.isArray(answers[item.question]) ? answers[item.question] as string[] : []}
        onChange={value => setAnswers(previous => ({ ...previous, [item.question]: value }))} /> : <>
        <label htmlFor={`${questionId}-${index}`} className="block text-sm">{item.question}</label>
        {item.options?.length ? <p className="text-xs text-[var(--color-secondary)]">可选：{item.options.map(option => option.label).join('、')}，也可以填写其他答案。</p> : null}
        <Input id={`${questionId}-${index}`} disabled={disabled} value={String(answers[item.question] ?? '')}
          onChange={event => setAnswers(previous => ({ ...previous, [item.question]: event.target.value }))} />
      </>}
    </div>)}
    <Button disabled={disabled || !complete} onClick={() => onAnswer(answers)}>提交回答</Button>
  </section>
}
