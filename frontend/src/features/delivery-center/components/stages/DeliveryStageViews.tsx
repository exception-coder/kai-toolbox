import { CheckCircle2, Download, FileText, Sparkles } from 'lucide-react'
import { MarkdownContent } from '@/components/markdown/MarkdownContent'
import type { PrdSessionView, QaPair, QuestionItem } from '@/features/prd-clarify/public-api'
import type { DeliveryRequirement } from '../../types'

export function DraftView({ session, sourceFiles }: { session: PrdSessionView; sourceFiles: SourceFile[] }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="space-y-3">
        <h3 className="text-xs font-semibold">原始需求源文件</h3>
        {sourceFiles.length > 0 ? sourceFiles.map(file => (
          <a
            key={`${file.url}-${file.name}`}
            href={file.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 border border-[var(--color-border)] p-3 text-xs hover:border-[var(--color-primary)]"
          >
            <FileText className="h-4 w-4 text-[var(--color-primary)]" />
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <Download className="h-3.5 w-3.5" />
          </a>
        )) : (
          <p className="text-xs text-[var(--color-muted-foreground)]">本需求通过文本或粘贴图片录入，没有独立源文件。</p>
        )}
        <BusinessFields session={session} />
      </aside>
      <section className="min-w-0 border-l border-[var(--color-border)] pl-5">
        <h3 className="mb-3 text-xs font-semibold">转换后的原始需求 Markdown</h3>
        <MarkdownContent content={session.rawInput || '暂无原始需求内容'} className="text-[13px]" />
      </section>
    </div>
  )
}

function BusinessFields({ session }: { session: PrdSessionView }) {
  const fields = [
    ['需求类型', session.businessFields.businessRequirementType],
    ['需求软件', session.businessFields.requirementSoftware],
    ['发起部门', session.businessFields.initiatingDepartment],
    ['提出人', session.businessFields.requester],
    ['提出日期', session.businessFields.requestedAt],
  ].filter(([, value]) => value)
  if (fields.length === 0) return null
  return (
    <dl className="space-y-2 border-t border-[var(--color-border)] pt-3 text-[10px]">
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt className="text-[var(--color-muted-foreground)]">{label}</dt>
          <dd className="mt-0.5 text-[var(--color-foreground)]">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function QuestionCards({
  perspective,
  questions,
  answers,
  onChange,
  disabled,
  onSubmit,
  submitLabel,
}: {
  perspective: string
  questions: QuestionItem[]
  answers: string[]
  onChange: (index: number, value: string) => void
  disabled: boolean
  onSubmit: () => void
  submitLabel: string
}) {
  if (questions.length === 0) {
    return <EmptyDocument label="正在等待 AI 输出澄清问题…" />
  }
  const completed = answers.filter(answer => answer.trim()).length
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--color-muted-foreground)]">{perspective}</p>
        <span className="shrink-0 text-[10px] text-[var(--color-primary)]">{completed}/{questions.length}</span>
      </div>
      <div className="space-y-3">
        {questions.map((item, index) => (
          <section key={item.id} className="border border-[var(--color-border)] p-4">
            <div className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[10px] font-semibold text-[var(--color-primary)]">
                {index + 1}
              </span>
              <p className="text-sm font-medium leading-relaxed">{item.question}</p>
            </div>
            <textarea
              value={answers[index] ?? ''}
              onChange={event => onChange(index, event.target.value)}
              rows={3}
              disabled={disabled}
              placeholder="请填写明确答案；所有问题完成后才会生成文档。"
              className="mt-3 w-full resize-y border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-sm outline-none focus:border-[var(--color-primary)] disabled:opacity-60"
            />
          </section>
        ))}
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || completed !== questions.length}
        className="mt-4 inline-flex items-center gap-1.5 bg-[var(--color-primary)] px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
      >
        <Sparkles className="h-3.5 w-3.5" />{submitLabel}
      </button>
    </div>
  )
}

export function ReadOnlyHistory({ history }: { history: QaPair[] }) {
  if (history.length === 0) return null
  return (
    <div className="space-y-3">
      {history.map((item, index) => (
        <section key={`${item.question}-${index}`} className="border border-[var(--color-border)] p-4">
          <p className="text-sm font-medium">{index + 1}. {item.question}</p>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[var(--color-muted-foreground)]">{item.answer}</p>
        </section>
      ))}
    </div>
  )
}

export function GeneratedNotice({ kind, content }: { kind: 'PRD' | 'TDD'; content: string }) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2 border border-[var(--color-success)]/30 bg-[var(--color-success)]/5 p-3 text-xs text-[var(--color-success)]">
        <CheckCircle2 className="h-4 w-4" />澄清已完成，{kind} 已生成。
      </div>
      <MarkdownContent content={content} className="text-[13px]" />
    </div>
  )
}

export function StageSummary({
  requirement,
  stage,
}: {
  requirement: DeliveryRequirement
  stage: 'code' | 'test' | 'runtime'
}) {
  const view = requirement.stages[stage]
  return (
    <div className="space-y-4">
      <div className="border border-[var(--color-border)] p-5">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">当前状态</div>
        <div className="mt-2 text-xl font-semibold">{view.score == null ? '尚未评估' : `${view.score}%`}</div>
        <p className="mt-2 text-xs leading-relaxed text-[var(--color-muted-foreground)]">{view.note}</p>
      </div>
      {stage === 'code' && requirement.progressItems.completed.length + requirement.progressItems.partial.length + requirement.progressItems.missing.length + (requirement.progressItems.excluded?.length ?? 0) > 0 && (
        <div className="space-y-2">
          {[...requirement.progressItems.missing, ...requirement.progressItems.partial, ...requirement.progressItems.completed, ...(requirement.progressItems.excluded ?? [])].map((item, index) => (
            <div key={`${item.title}-${index}`} className="border border-[var(--color-border)] p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-medium">{item.title}</p>
                {requirement.progressItems.excluded?.includes(item) && <span className="shrink-0 text-[9px] font-medium text-sky-600">观察项 · 0 分</span>}
              </div>
              <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">{item.actual || item.missing || item.implemented}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function EmptyDocument({ label }: { label: string }) {
  return (
    <div className="py-20 text-center">
      <FileText className="mx-auto h-6 w-6 text-[var(--color-muted-foreground)]" />
      <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">{label}</p>
    </div>
  )
}

interface SourceFile {
  name: string
  url: string
}
