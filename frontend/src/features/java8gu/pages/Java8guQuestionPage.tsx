import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Clock,
  Code2,
  FileText,
  Hash,
  Lightbulb,
  Star,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Segmented } from '@/components/ui/segmented'
import { findCategory, findQuestion, loadIndex, loadMarkdown, viewCategory } from '../data'
import type { Java8guCategory, Java8guIndex, Java8guQuestion } from '../types'
import { extractToc, parseMarkdownAST, type TocItem } from '../lib/markdown'
import {
  groupSections,
  parseStructure,
  sectionAnchorId,
  SUMMARY_ANCHOR_ID,
  type SectionGroup,
} from '../lib/structure'
import { iconFor } from '../lib/mindmap'
import { QuestionTocPanel } from '../components/QuestionTocPanel'
import { QuestionVisualSummary } from '../components/QuestionVisualSummary'
import { KnowledgeEnrichPanel } from '../components/KnowledgeEnrichPanel'
import { MarkdownViewer } from '../components/markdown/MarkdownViewer'
import { SendToGptButton } from '../components/SendToGptButton'
import '../styles/java8gu.css'

type ViewMode = 'visual' | 'text'
const VIEW_MODE_KEY = 'java8gu:view-mode'

interface Navigators {
  prev?: Java8guQuestion
  next?: Java8guQuestion
}

export function Java8guQuestionPage() {
  const { qid = '' } = useParams<{ qid: string }>()
  const [index, setIndex] = useState<Java8guIndex | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [markdown, setMarkdown] = useState<string>('')
  const [loadingMd, setLoadingMd] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'visual'
    const saved = window.localStorage.getItem(VIEW_MODE_KEY)
    return saved === 'text' ? 'text' : 'visual'
  })
  const articleRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, viewMode)
    } catch {
      /* localStorage 不可用时静默 */
    }
  }, [viewMode])

  useEffect(() => {
    let cancelled = false
    loadIndex()
      .then(idx => {
        if (!cancelled) setIndex(idx)
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoadingMd(true)
    loadMarkdown(qid)
      .then(text => {
        if (!cancelled) {
          setMarkdown(text)
          setLoadingMd(false)
        }
      })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setLoadingMd(false)
        }
      })
    // 切题时滚回顶部
    window.scrollTo({ top: 0 })
    return () => {
      cancelled = true
    }
  }, [qid])

  const question = useMemo<Java8guQuestion | undefined>(
    () => (index ? findQuestion(index, qid) : undefined),
    [index, qid],
  )
  const category = useMemo<Java8guCategory | undefined>(
    () => (index && question ? findCategory(index, question.categoryId) : undefined),
    [index, question],
  )
  const navigators = useMemo<Navigators>(() => {
    if (!index || !question) return {}
    const v = viewCategory(index, question.categoryId)
    if (!v) return {}
    const i = v.questions.findIndex(q => q.id === question.id)
    if (i < 0) return {}
    return { prev: v.questions[i - 1], next: v.questions[i + 1] }
  }, [index, question])

  const tokens = useMemo(() => parseMarkdownAST(markdown), [markdown])
  const toc: TocItem[] = useMemo(() => extractToc(markdown), [markdown])
  const structure = useMemo(() => parseStructure(markdown), [markdown])
  const groups = useMemo(() => groupSections(structure.sections), [structure])

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link
          to="/tools/java8gu"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft className="h-4 w-4" /> 返回分类
        </Link>
        <div className="mt-6 rounded-lg border border-rose-300/60 bg-rose-50/60 p-4 text-sm text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      </div>
    )
  }

  if (!question || !category) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="space-y-3">
          <div className="h-6 w-1/3 animate-pulse rounded bg-[var(--color-muted)]/60" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--color-muted)]/40" />
          <div className="h-3 w-full animate-pulse rounded bg-[var(--color-muted)]/40" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-[var(--color-muted)]/40" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
      {/* 面包屑 */}
      <div className="mb-3 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap text-[11px] text-[var(--color-muted-foreground)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mb-4 sm:overflow-visible sm:text-xs">
        <Link to="/tools/java8gu" className="hover:text-[var(--color-foreground)]">
          Java 八股
        </Link>
        <span>/</span>
        <Link
          to={`/tools/java8gu/c/${category.id}`}
          className="hover:text-[var(--color-foreground)]"
        >
          {category.label}
        </Link>
        <span>/</span>
        <span className="font-mono">#{question.id}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
        <article ref={articleRef} className="min-w-0">
          {/* 题目大标题与元信息 */}
          <header className="mb-5 border-b border-[var(--color-border)] pb-4 sm:mb-6 sm:pb-5">
            <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-muted)] px-2 py-0.5 font-medium text-[var(--color-foreground)]/80">
                <Hash className="h-3 w-3" />#{question.id}
              </span>
              <span className="inline-flex items-center gap-1 text-[var(--color-muted-foreground)]">
                <Clock className="h-3 w-3" /> {question.readMin} min
              </span>
              <span className="inline-flex items-center gap-1 text-[var(--color-muted-foreground)]">
                <FileText className="h-3 w-3" /> {question.chars.toLocaleString()} 字
              </span>
              {question.codeCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[var(--color-muted-foreground)]">
                  <Code2 className="h-3 w-3" /> {question.codeCount} 段
                </span>
              )}
              {question.codeLangs.length > 0 && (
                <span className="ml-1 hidden flex-wrap gap-1 sm:flex">
                  {question.codeLangs.slice(0, 4).map(l => (
                    <span
                      key={l}
                      className="rounded bg-[var(--color-muted)] px-1.5 py-0.5 font-mono text-[10px]"
                    >
                      {l}
                    </span>
                  ))}
                </span>
              )}
            </div>
            <h1 className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
              {question.title}
            </h1>

            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 sm:mt-4">
              <Segmented<ViewMode>
                value={viewMode}
                onChange={setViewMode}
                options={[
                  { value: 'visual', label: '图表视图' },
                  { value: 'text', label: '原文' },
                ]}
                size="md"
              />
              <div className="flex items-center gap-3">
                <span className="hidden text-[11px] text-[var(--color-muted-foreground)] sm:inline">
                  {viewMode === 'visual'
                    ? '章节卡片 · 速记知识点'
                    : '展开完整 markdown'}
                </span>
                <SendToGptButton
                  question={question}
                  markdown={markdown}
                  disabled={loadingMd}
                />
              </div>
            </div>
          </header>

          {/* 一句话总结 —— 最高优先级，先理解 */}
          {question.tldr && (
            <div
              id={SUMMARY_ANCHOR_ID}
              className="mb-5 overflow-hidden rounded-xl border border-[var(--color-primary)]/25 bg-gradient-to-br from-[var(--color-primary)]/10 via-[var(--color-primary)]/5 to-transparent p-4 [scroll-margin-top:5rem] sm:mb-6 sm:p-5"
            >
              <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
                <Lightbulb className="h-3.5 w-3.5" /> 一句话总结
              </div>
              <p className="mt-2 text-[14px] font-medium leading-relaxed text-[var(--color-foreground)] sm:text-[15px]">
                {question.tldr}
              </p>
            </div>
          )}

          {/* 正文 */}
          {loadingMd ? (
            <div className="space-y-3">
              <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--color-muted)]/40" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-[var(--color-muted)]/40" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--color-muted)]/40" />
            </div>
          ) : viewMode === 'visual' ? (
            <QuestionVisualSummary structure={structure} />
          ) : (
            <MarkdownViewer tokens={tokens} />
          )}

          {/* 结构化知识 · AI 增强（图解/面试题/易错点/深度讲解） */}
          {!loadingMd && markdown && (
            <KnowledgeEnrichPanel id={question.id} markdown={markdown} />
          )}

          {/* Prev / Next */}
          <nav className="mt-8 grid grid-cols-2 gap-2 border-t border-[var(--color-border)] pt-5 sm:mt-10 sm:gap-3 sm:pt-6">
            <NavCard direction="prev" question={navigators.prev} />
            <NavCard direction="next" question={navigators.next} />
          </nav>
        </article>

        {/* 元信息 / 跳转目录边栏（lg+） */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 flex max-h-[calc(100vh-3rem)] flex-col gap-4">
            {/* 章节目录 —— 主角：点击定位，滚动高亮，撑满右栏高度 */}
            {(viewMode === 'text' ? toc.length > 0 : groups.length > 0) && (
              <div className="flex min-h-0 flex-1 flex-col rounded-xl border bg-[var(--color-card)] p-3.5">
                <div className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  <FileText className="h-3 w-3 text-[var(--color-primary)]" /> 目录
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
                  {viewMode === 'text' ? (
                    <QuestionTocPanel items={toc} containerRef={articleRef} />
                  ) : (
                    <SectionOutline
                      groups={groups}
                      hasSummary={!!question.tldr}
                    />
                  )}
                </div>
              </div>
            )}

            {/* 分类 + 难度 + 统计（紧凑） */}
            <div className="shrink-0 rounded-xl border bg-[var(--color-card)] p-3.5">
              <Link
                to={`/tools/java8gu/c/${category.id}`}
                className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              >
                <BookOpen className="h-3.5 w-3.5" />
                {category.label}
              </Link>
              <div className="mt-3 flex items-center justify-between border-t border-[var(--color-border)]/60 pt-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  难度
                </span>
                <DifficultyStars value={question.difficulty} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-1.5 text-[10.5px]">
                <Cell label="字数" value={question.chars.toLocaleString()} />
                <Cell label="章节" value={`${question.headings.length} 节`} />
                <Cell label="阅读" value={`${question.readMin} min`} />
                <Cell label="代码" value={`${question.codeCount} 段`} />
              </div>
            </div>

            {/* 上/下一题快捷跳转 */}
            <div className="grid shrink-0 grid-cols-2 gap-2">
              <RailNav direction="prev" question={navigators.prev} />
              <RailNav direction="next" question={navigators.next} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Cell({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded bg-[var(--color-muted)]/40 px-2 py-1.5">
      <div className="text-[9.5px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </div>
      <div className="mt-0.5 truncate text-[12px] font-medium">
        {value}
      </div>
    </div>
  )
}

function DifficultyStars({ value }: { value: number }) {
  const v = Math.max(0, Math.min(5, Math.round(value)))
  return (
    <span className="flex items-center gap-0.5" title={`难度 ${v}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            'h-3.5 w-3.5',
            i < v
              ? 'fill-amber-400 text-amber-400'
              : 'text-[var(--color-muted-foreground)]/30',
          )}
        />
      ))}
    </span>
  )
}

function RailNav({
  direction,
  question,
}: {
  direction: 'prev' | 'next'
  question?: Java8guQuestion
}) {
  const Icon = direction === 'prev' ? ArrowLeft : ArrowRight
  const label = direction === 'prev' ? '上一题' : '下一题'
  if (!question) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed px-2 py-2 text-[10.5px] text-[var(--color-muted-foreground)]/60">
        {direction === 'prev' ? '已是首题' : '已是末题'}
      </div>
    )
  }
  return (
    <Link
      to={`/tools/java8gu/q/${question.id}`}
      title={question.title}
      className={cn(
        'group flex items-center gap-1 rounded-lg border bg-[var(--color-card)] px-2 py-2 text-[11px] text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--color-primary)]/40 hover:text-[var(--color-primary)]',
        direction === 'next' && 'flex-row-reverse',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  )
}

/**
 * 图表视图的跳转目录：点击定位到对应速记卡片，随滚动高亮当前章节。
 * 目录项与卡片共用 sectionAnchorId，一一对应。
 */
function SectionOutline({
  groups,
  hasSummary,
}: {
  groups: SectionGroup[]
  hasSummary: boolean
}) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const entries = useMemo(() => {
    const list: { id: string; label: string; icon: string }[] = []
    if (hasSummary) {
      list.push({ id: SUMMARY_ANCHOR_ID, label: '一句话总结', icon: '💡' })
    }
    groups.forEach((g, i) => {
      list.push({
        id: sectionAnchorId(i),
        label: g.head.title,
        icon: iconFor(g.head.title),
      })
    })
    return list
  }, [groups, hasSummary])

  useEffect(() => {
    if (entries.length === 0) return
    const els = entries
      .map(e => document.getElementById(e.id))
      .filter((el): el is HTMLElement => !!el)
    if (els.length === 0) return
    const observer = new IntersectionObserver(
      obs => {
        const visible = obs
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) setActiveId(visible[0].target.id)
      },
      { rootMargin: '-80px 0px -55% 0px', threshold: 0 },
    )
    els.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [entries])

  const handleJump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (entries.length === 0) return null

  return (
    <nav>
      <ul className="space-y-0.5">
        {entries.map((e, i) => {
          const active = activeId === e.id
          const num = hasSummary ? i : i + 1
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => handleJump(e.id)}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors',
                  active
                    ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    : 'text-[var(--color-foreground)]/80 hover:bg-[var(--color-muted)]/50',
                )}
              >
                <span className="w-4 shrink-0 text-center text-[13px]">
                  {e.id === SUMMARY_ANCHOR_ID ? e.icon : num}
                </span>
                <span className="line-clamp-1 flex-1 text-[12px]">{e.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function NavCard({
  direction,
  question,
}: {
  direction: 'prev' | 'next'
  question?: Java8guQuestion
}) {
  if (!question) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-xs text-[var(--color-muted-foreground)]">
        {direction === 'prev' ? '已是本类第一题' : '已是本类最后一题'}
      </div>
    )
  }
  const Icon = direction === 'prev' ? ArrowLeft : ArrowRight
  const align = direction === 'prev' ? 'items-start text-left' : 'items-end text-right'
  return (
    <Link
      to={`/tools/java8gu/q/${question.id}`}
      className={`group flex flex-col gap-1 rounded-lg border bg-[var(--color-card)] p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary)]/40 hover:shadow-md ${align}`}
    >
      <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {direction === 'prev' ? (
          <>
            <Icon className="h-3 w-3" /> 上一题
          </>
        ) : (
          <>
            下一题 <Icon className="h-3 w-3" />
          </>
        )}
      </span>
      <span className="line-clamp-2 text-sm font-medium leading-snug text-[var(--color-foreground)] group-hover:text-[var(--color-primary)]">
        {question.title}
      </span>
      <span className="text-[10.5px] text-[var(--color-muted-foreground)]">
        #{question.id}
      </span>
    </Link>
  )
}
