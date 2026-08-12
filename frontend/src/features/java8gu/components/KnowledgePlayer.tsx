import { useEffect, useState } from 'react'
import type { Token } from 'marked'
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  BriefcaseBusiness,
  CheckCircle2,
  Code2,
  Eye,
  GitBranch,
  Lightbulb,
  MessageSquareText,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { KnowledgeDetail, KnowledgeRelation } from '../api/knowledgeApi'
import { MarkdownViewer } from './markdown/MarkdownViewer'

export type LearningRating = 'weak' | 'fuzzy' | 'mastered'

export interface LearningRecord {
  rating: LearningRating
  updatedAt: string
}

type Layer = 'recall' | 'answer' | 'principle' | 'project' | 'code' | 'source'

interface Props {
  detail: KnowledgeDetail
  tokens: Token[]
  relations: KnowledgeRelation[]
  answer: string
  rating?: LearningRating
  onAnswerChange: (value: string) => void
  onSelectRelation: (nodeId: string) => void
  onNext: () => void
}

const LAYERS: { id: Layer; label: string; icon: typeof BrainCircuit }[] = [
  { id: 'recall', label: 'Recall', icon: BrainCircuit },
  { id: 'answer', label: '30 秒答案', icon: Lightbulb },
  { id: 'principle', label: '深入原理', icon: Sparkles },
  { id: 'project', label: '项目表达', icon: BriefcaseBusiness },
  { id: 'code', label: 'Code', icon: Code2 },
  { id: 'source', label: '资料层', icon: BookOpen },
]

export function KnowledgePlayer({
  detail,
  tokens,
  relations,
  answer,
  rating,
  onAnswerChange,
  onSelectRelation,
  onNext,
}: Props) {
  const [layer, setLayer] = useState<Layer>('recall')
  const card = detail.interviews[0]
  const focusTerms = buildFocusTerms(detail.node.title)

  useEffect(() => {
    setLayer('recall')
  }, [detail.node.id])

  return (
    <article className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <header className="relative overflow-hidden rounded-3xl border border-indigo-500/15 bg-gradient-to-br from-indigo-500/[0.09] via-[var(--color-card)] to-violet-500/[0.06] p-5 shadow-sm sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">
            <span>{formatNodeId(detail.node.id)}</span>
            <span className="h-1 w-1 rounded-full bg-current opacity-50" />
            <span>{detail.node.nodeType}</span>
            {rating && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 normal-case tracking-normal text-emerald-600 dark:text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />{ratingLabel(rating)}
              </span>
            )}
          </div>
          <h1 className="mt-4 max-w-4xl text-2xl font-semibold leading-tight tracking-tight sm:text-3xl lg:text-[2.15rem]">
            {detail.node.title}
          </h1>

          <div className="mt-5 rounded-2xl border border-white/50 bg-[var(--color-background)]/75 p-4 shadow-sm backdrop-blur dark:border-white/5">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-300">
              <Lightbulb className="h-4 w-4" />一句话理解
            </div>
            <p className="whitespace-pre-line text-[15px] font-medium leading-7">{detail.node.summary}</p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs text-[var(--color-muted-foreground)]">面试官真正想考</span>
            {focusTerms.map(term => (
              <span key={term} className="rounded-full border border-indigo-500/15 bg-indigo-500/[0.07] px-2.5 py-1 text-xs text-indigo-700 dark:text-indigo-200">
                {term}
              </span>
            ))}
          </div>
        </div>
      </header>

      <nav className="sticky top-0 z-10 -mx-1 mt-5 overflow-x-auto rounded-2xl border bg-[var(--color-background)]/90 p-1.5 shadow-sm backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max gap-1">
          {LAYERS.map(item => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setLayer(item.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors',
                  layer === item.id
                    ? 'bg-[var(--color-foreground)] text-[var(--color-background)]'
                    : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]/60 hover:text-[var(--color-foreground)]',
                )}
              >
                <Icon className="h-3.5 w-3.5" />{item.label}
              </button>
            )
          })}
        </div>
      </nav>

      <section className="mt-5 min-h-[360px] rounded-3xl border bg-[var(--color-card)] p-5 shadow-sm sm:p-7">
        {layer === 'recall' && (
          <RecallLayer
            question={card?.question ?? detail.node.title}
            answer={answer}
            onAnswerChange={onAnswerChange}
            onReveal={() => setLayer('answer')}
          />
        )}
        {layer === 'answer' && (
          <AnswerLayer
            eyebrow="30 秒回答"
            title="先讲结论，再补关键边界"
            text={card?.shortAnswer ?? detail.node.summary}
            onContinue={() => setLayer('principle')}
          />
        )}
        {layer === 'principle' && (
          <AnswerLayer
            eyebrow="深入原理"
            title="把答案讲到经得住追问"
            text={card?.detailAnswer ?? '当前节点暂未配置独立原理卡片，可在资料层查看完整内容。'}
            onContinue={() => setLayer('project')}
          />
        )}
        {layer === 'project' && (
          <AnswerLayer
            eyebrow="项目表达"
            title="让知识点落到真实工程语境"
            text={card?.projectAnswer ?? '当前节点暂未配置项目表达，可结合完整资料组织自己的案例。'}
            onContinue={() => setLayer('code')}
          />
        )}
        {layer === 'code' && <CodeLayer detail={detail} onOpenSource={() => setLayer('source')} />}
        {layer === 'source' && (
          <div>
            <SectionHeader eyebrow="完整资料层" title="需要时再深入，不让长文挡住第一次学习" />
            <div className="mt-7 border-t pt-2">
              <MarkdownViewer tokens={tokens} />
            </div>
          </div>
        )}
      </section>

      <section className="mt-5 rounded-3xl border bg-gradient-to-r from-[var(--color-card)] to-[var(--color-muted)]/25 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
              <GitBranch className="h-4 w-4" />知识继续流动
            </div>
            <h2 className="mt-2 text-lg font-semibold">学完这一题，直接进入下一条关联路径</h2>
          </div>
          <button
            type="button"
            onClick={onNext}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--color-primary-foreground)] shadow-sm transition hover:-translate-y-0.5"
          >
            下一知识点 <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        {relations.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {relations.map(relation => (
              <button
                key={relation.id}
                type="button"
                onClick={() => onSelectRelation(relation.node.id)}
                className="rounded-xl border bg-[var(--color-background)] px-3 py-2 text-left text-xs transition hover:border-[var(--color-primary)]/50"
              >
                <span className="mr-2 text-[10px] text-[var(--color-muted-foreground)]">{relation.relationType}</span>
                {relation.node.title}
              </button>
            ))}
          </div>
        )}
      </section>
    </article>
  )
}

function RecallLayer({
  question,
  answer,
  onAnswerChange,
  onReveal,
}: {
  question: string
  answer: string
  onAnswerChange: (value: string) => void
  onReveal: () => void
}) {
  return (
    <div>
      <SectionHeader eyebrow="主动回忆" title="先别看答案，用自己的话讲一遍" />
      <div className="mt-7 rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.06] p-5">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-300">
          <MessageSquareText className="h-4 w-4" />面试题
        </div>
        <p className="text-lg font-semibold leading-8">{question}</p>
      </div>
      <label className="mt-6 block text-xs font-semibold text-[var(--color-muted-foreground)]" htmlFor="java8gu-recall-answer">
        你的回答
      </label>
      <textarea
        id="java8gu-recall-answer"
        value={answer}
        onChange={event => onAnswerChange(event.target.value)}
        rows={6}
        placeholder="不看资料，先写出定义、原理、边界和项目例子……"
        className="mt-2 w-full resize-y rounded-2xl border bg-[var(--color-background)] px-4 py-3 text-sm leading-6 outline-none transition focus:border-[var(--color-primary)]/50 focus:ring-4 focus:ring-[var(--color-primary)]/10"
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-[var(--color-muted-foreground)]">
          {answer.trim() ? `已写 ${answer.trim().length} 字，核对时重点看遗漏和表述准确性。` : '写不出来也没关系，先暴露盲区才是真正的学习。'}
        </span>
        <button
          type="button"
          onClick={onReveal}
          className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-primary)]/5"
        >
          <Eye className="h-4 w-4" />核对 30 秒答案
        </button>
      </div>
    </div>
  )
}

function AnswerLayer({ eyebrow, title, text, onContinue }: { eyebrow: string; title: string; text: string; onContinue: () => void }) {
  return (
    <div>
      <SectionHeader eyebrow={eyebrow} title={title} />
      <div className="mt-7 rounded-2xl border bg-[var(--color-muted)]/20 p-5 sm:p-6">
        <StructuredText text={text} />
      </div>
      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onContinue} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-primary)] hover:underline">
          继续深入 <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function CodeLayer({ detail, onOpenSource }: { detail: KnowledgeDetail; onOpenSource: () => void }) {
  return (
    <div>
      <SectionHeader eyebrow="代码与重构" title="用前后对比确认自己真的理解" />
      {detail.examples.length > 0 ? (
        <div className="mt-7 space-y-6">
          {detail.examples.map(example => (
            <section key={example.id}>
              <h3 className="mb-3 font-semibold">{example.title}</h3>
              <div className="grid gap-4 2xl:grid-cols-2">
                <CodePanel title="重构前" code={example.beforeCode} tone="rose" />
                <CodePanel title="重构后" code={example.afterCode} tone="emerald" />
              </div>
              <p className="mt-3 rounded-xl bg-[var(--color-muted)]/30 p-3 text-sm leading-6">{example.explanation}</p>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-7 rounded-2xl border border-dashed p-8 text-center">
          <Code2 className="mx-auto h-7 w-7 text-[var(--color-muted-foreground)]" />
          <p className="mt-3 text-sm font-medium">当前节点没有独立的前后重构案例</p>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">完整正文中可能仍包含示例代码。</p>
          <button type="button" onClick={onOpenSource} className="mt-4 text-sm font-semibold text-[var(--color-primary)] hover:underline">打开资料层</button>
        </div>
      )}
    </div>
  )
}

function CodePanel({ title, code, tone }: { title: string; code: string; tone: 'rose' | 'emerald' }) {
  return (
    <div className="overflow-hidden rounded-2xl border">
      <div className={cn('border-b px-3 py-2 text-xs font-semibold', tone === 'rose' ? 'bg-rose-500/10 text-rose-600' : 'bg-emerald-500/10 text-emerald-600')}>
        {title}
      </div>
      <pre className="overflow-x-auto bg-slate-950 p-4 text-xs leading-6 text-slate-100"><code>{code.replace(/^```java\n|\n```$/g, '')}</code></pre>
    </div>
  )
}

function StructuredText({ text }: { text: string }) {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
  return (
    <div className="space-y-3 text-[15px] leading-7">
      {lines.map((line, index) => line.startsWith('- ') ? (
        <div key={index} className="flex gap-3">
          <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" />
          <p>{line.slice(2)}</p>
        </div>
      ) : <p key={index}>{line}</p>)}
    </div>
  )
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">{eyebrow}</div>
      <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
    </div>
  )
}

function buildFocusTerms(title: string): string[] {
  const terms: string[] = []
  if (/区别|对比|选择|还是/.test(title)) terms.push('边界与取舍')
  if (/为什么|原理|底层|实现/.test(title)) terms.push('设计动机')
  if (/如何|怎么|实践|项目|场景/.test(title)) terms.push('工程应用')
  if (/异常|问题|坑|失败|风险/.test(title)) terms.push('常见陷阱')
  if (terms.length === 0) terms.push('核心定义')
  terms.push('口语表达')
  return terms.slice(0, 3)
}

function formatNodeId(id: string): string {
  return `Knowledge ${id.replace(/^yuque-(?:node|live)-/, '#')}`
}

function ratingLabel(rating: LearningRating): string {
  return { weak: '需要重学', fuzzy: '有点印象', mastered: '可以讲清' }[rating]
}
