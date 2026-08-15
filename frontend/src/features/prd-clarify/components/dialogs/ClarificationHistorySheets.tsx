import { useEffect, useState } from 'react'
import { BotMessageSquare, Loader2, User, X } from 'lucide-react'
import { listDevDocVersions } from '../../api'
import type { DevDocVersionSummary, QuestionItem } from '../../types'

interface SheetProps {
  onClose: () => void
}

function SheetCloseButton({ onClose }: SheetProps) {
  return (
    <button
      type="button"
      aria-label="关闭"
      onClick={onClose}
      className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
    >
      <X className="w-4 h-4" />
    </button>
  )
}

function QuestionAnswerList({
  questions,
  accent = 'primary',
}: {
  questions: Array<{ id?: string | number; question: string; answer: string | null }>
  accent?: 'primary' | 'purple'
}) {
  return questions.map((question, index) => (
    <div key={question.id ?? index} className="rounded-xl border border-[var(--color-border)] overflow-hidden">
      <div className="flex items-start gap-2.5 p-3 bg-[var(--color-muted)]/30">
        <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-semibold ${
          accent === 'purple'
            ? 'bg-purple-500/20 text-purple-400'
            : 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]'
        }`}>
          {index + 1}
        </div>
        <p className="text-sm leading-relaxed">{question.question}</p>
      </div>
      <div className="flex items-start gap-2.5 p-3 border-t border-[var(--color-border)]">
        <User className="w-4 h-4 flex-shrink-0 mt-0.5 text-[var(--color-muted-foreground)]" />
        <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">
          {question.answer || <span className="italic">（未填写）</span>}
        </p>
      </div>
    </div>
  ))
}

export function ClarifyHistorySheet({
  questions,
  onClose,
}: SheetProps & { questions: QuestionItem[] }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="prd-clarify-history-title" className="relative w-full max-w-md bg-[var(--color-card)] border-l border-[var(--color-border)] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <BotMessageSquare className="w-4 h-4 text-[var(--color-primary)]" />
            <span id="prd-clarify-history-title" className="font-semibold text-sm">PRD 澄清问答记录</span>
            <span className="text-xs text-[var(--color-muted-foreground)]">（共 {questions.length} 题）</span>
          </div>
          <SheetCloseButton onClose={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {questions.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)] italic">暂无澄清记录</p>
          ) : (
            <QuestionAnswerList questions={questions} />
          )}
        </div>
        <div className="px-5 py-3 border-t border-[var(--color-border)] text-xs text-[var(--color-muted-foreground)]">
          此记录已纳入 PRD 生成，关闭后可继续编辑文档。开发文档「更新版本」有自己独立的
          澄清记录，切到开发文档 Tab 后点「本版澄清」单独查看
        </div>
      </div>
    </div>
  )
}

export function DevDocClarifyHistorySheet({
  sessionId,
  onClose,
}: SheetProps & { sessionId: string }) {
  const [version, setVersion] = useState<DevDocVersionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listDevDocVersions(sessionId)
      .then((list) => {
        if (!cancelled) setVersion(list.find((item) => item.isCurrent) ?? list[0] ?? null)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : '加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [sessionId])

  const questions = version?.qaHistory ?? []

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="dev-doc-clarify-history-title" className="relative w-full max-w-md bg-[var(--color-card)] border-l border-[var(--color-border)] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <BotMessageSquare className="w-4 h-4 text-purple-400" />
            <span id="dev-doc-clarify-history-title" className="font-semibold text-sm">开发文档澄清问答记录</span>
            {version && (
              <span className="text-xs text-[var(--color-muted-foreground)]">
                （v{version.version} · 共 {questions.length} 题）
              </span>
            )}
          </div>
          <SheetCloseButton onClose={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
              <Loader2 className="w-4 h-4 animate-spin" /> 加载中…
            </div>
          ) : error ? (
            <p className="text-sm text-red-500">加载失败：{error}</p>
          ) : questions.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)] italic">
              {version?.mode === 'update'
                ? '本版更新时说明已足够明确，未触发追加澄清提问'
                : '当前版本不是通过「更新版本」澄清生成的，没有对应的问答记录'}
            </p>
          ) : (
            <QuestionAnswerList questions={questions} accent="purple" />
          )}
        </div>
        <div className="px-5 py-3 border-t border-[var(--color-border)] text-xs text-[var(--color-muted-foreground)]">
          这是当前显示版本（v{version?.version ?? '?'}）自己的澄清记录，跟 PRD 澄清问答记录是
          两份独立数据。其它历史版本各自的澄清记录，在「生成记录」里按版本查看
        </div>
      </div>
    </div>
  )
}
