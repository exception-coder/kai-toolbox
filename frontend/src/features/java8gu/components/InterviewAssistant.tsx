import { Link } from 'react-router-dom'
import { ArrowRight, BrainCircuit, Check, CircleAlert, MessageSquareText, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { KnowledgeInterview, KnowledgeRelation } from '../api/knowledgeApi'
import type { LearningRating } from './KnowledgePlayer'

interface Props {
  interviews: KnowledgeInterview[]
  relations: KnowledgeRelation[]
  answer: string
  rating?: LearningRating
  onRate: (rating: LearningRating) => void
  onSelectRelation: (nodeId: string) => void
}

export function InterviewAssistant({ interviews, relations, answer, rating, onRate, onSelectRelation }: Props) {
  const card = interviews[0]
  if (!card) {
    return <div className="rounded-lg border border-dashed p-4 text-sm text-[var(--color-muted-foreground)]">该节点暂未配置面试卡片。</div>
  }
  const score = rating ? { weak: 35, fuzzy: 68, mastered: 100 }[rating] : 0
  const followUp = relations[0]

  return (
    <aside className="space-y-5">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold"><BrainCircuit className="h-4 w-4 text-violet-500" />Interview Coach</div>
        <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">自评驱动 · 不生成虚假 AI 分数</p>
      </div>

      <section className="rounded-2xl border bg-gradient-to-br from-violet-500/[0.08] to-indigo-500/[0.04] p-4">
        <div className="flex items-center gap-4">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(var(--color-primary) ${score}%, color-mix(in srgb, var(--color-muted) 80%, transparent) 0)` }}>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-card)] text-sm font-semibold tabular-nums">{score}%</div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-[var(--color-muted-foreground)]">当前掌握</div>
            <div className="mt-1 font-semibold">{rating ? ratingLabel(rating) : '等待自评'}</div>
            <div className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">{answer.trim() ? `已完成 ${answer.trim().length} 字 Recall` : '先在中间写下自己的答案'}</div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--color-muted-foreground)]">
          <MessageSquareText className="h-3.5 w-3.5" />本题
        </div>
        <p className="text-sm font-medium leading-6">{card.question}</p>
      </section>

      <section>
        <div className="mb-2 text-xs font-semibold text-[var(--color-muted-foreground)]">核对答案后，你能讲到什么程度？</div>
        <div className="grid gap-2">
          <RatingButton active={rating === 'weak'} icon={CircleAlert} label="还不会" note="重新理解" tone="rose" onClick={() => onRate('weak')} />
          <RatingButton active={rating === 'fuzzy'} icon={Sparkles} label="有点印象" note="短期复习" tone="amber" onClick={() => onRate('fuzzy')} />
          <RatingButton active={rating === 'mastered'} icon={Check} label="可以讲清" note="进入关联题" tone="emerald" onClick={() => onRate('mastered')} />
        </div>
      </section>

      <section className="rounded-2xl border border-dashed p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">继续追问</div>
        <p className="mt-2 text-sm leading-6">
          {followUp ? `如果面试官把问题延伸到「${followUp.node.title}」，你会怎么回答？` : '尝试补充一个反例、边界条件或真实项目场景。'}
        </p>
        {followUp && (
          <button type="button" onClick={() => onSelectRelation(followUp.node.id)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:underline">
            进入关联题 <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </section>

      <Link
        to="/tools/java8gu/ask"
        className="flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm font-semibold transition hover:border-violet-500/40 hover:bg-violet-500/[0.06]"
      >
        <span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-500" />进入 AI 追问</span>
        <ArrowRight className="h-4 w-4" />
      </Link>
    </aside>
  )
}

function RatingButton({
  active,
  icon: Icon,
  label,
  note,
  tone,
  onClick,
}: {
  active: boolean
  icon: typeof Check
  label: string
  note: string
  tone: 'rose' | 'amber' | 'emerald'
  onClick: () => void
}) {
  const tones = {
    rose: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200',
    amber: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200',
    emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:-translate-y-0.5',
        active ? tones[tone] : 'bg-[var(--color-background)] hover:border-[var(--color-primary)]/30',
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="min-w-0 flex-1 text-xs font-semibold">{label}</span>
      <span className="text-[10px] opacity-65">{note}</span>
    </button>
  )
}

function ratingLabel(rating: LearningRating): string {
  return { weak: '需要重学', fuzzy: '有点印象', mastered: '可以讲清' }[rating]
}
