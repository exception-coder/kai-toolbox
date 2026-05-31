import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Code2, ListTree, Table2 } from 'lucide-react'
import { loadIndex, viewCategory } from '../data'
import type { CategoryView } from '../data'
import { QuestionCard } from '../components/QuestionCard'
import { FilterToolbar, type FilterState } from '../components/FilterToolbar'

const FILTER_KEY = 'java8gu:category-filter'

const DEFAULT_FILTER: FilterState = {
  search: '',
  onlyCode: false,
}

function loadFilter(): FilterState {
  if (typeof window === 'undefined') return { ...DEFAULT_FILTER }
  try {
    const raw = window.localStorage.getItem(FILTER_KEY)
    if (!raw) return { ...DEFAULT_FILTER }
    const parsed = JSON.parse(raw) as Partial<FilterState>
    return {
      search: typeof parsed.search === 'string' ? parsed.search : '',
      onlyCode: !!parsed.onlyCode,
    }
  } catch {
    return { ...DEFAULT_FILTER }
  }
}

export function Java8guCategoryPage() {
  const { cid = '' } = useParams<{ cid: string }>()
  const [view, setView] = useState<CategoryView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterState>(loadFilter)

  useEffect(() => {
    try {
      window.localStorage.setItem(FILTER_KEY, JSON.stringify(filter))
    } catch {
      /* ignore */
    }
  }, [filter])

  useEffect(() => {
    let cancelled = false
    loadIndex()
      .then(idx => {
        if (cancelled) return
        const v = viewCategory(idx, cid)
        if (!v) {
          setError(`未找到分类：${cid}`)
        } else {
          setView(v)
        }
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [cid])

  const visible = useMemo(() => {
    if (!view) return []
    const kw = filter.search.trim().toLowerCase()
    let list = view.questions
    if (filter.onlyCode) list = list.filter(q => q.codeCount > 0)
    if (kw) {
      list = list.filter(
        q =>
          q.title.toLowerCase().includes(kw) ||
          q.tldr.toLowerCase().includes(kw) ||
          q.id.includes(kw),
      )
    }
    return [...list].sort((a, b) => a.id.localeCompare(b.id))
  }, [view, filter])

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

  if (!view) {
    return <CategoryPageSkeleton />
  }

  const { category, questions } = view
  const aggStats = computeAggStats(questions)

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:mb-5">
        <div>
          <Link
            to="/tools/java8gu"
            className="inline-flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> 全部分类
          </Link>
        </div>
        <div className="min-w-0">
          <div className="font-mono text-[11px] tracking-wider text-[var(--color-muted-foreground)]">
            {category.id}
          </div>
          <h1 className="mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl">
            {category.label}
            <span className="ml-2 text-sm font-normal text-[var(--color-muted-foreground)] sm:text-base">
              · {category.count} 题
            </span>
          </h1>
        </div>

        {/* 聚合指标条 —— 移动端横向滚动 */}
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 text-[11px] text-[var(--color-muted-foreground)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          <Tag icon={<Code2 className="h-3 w-3" />}>
            含代码 {aggStats.withCode}
          </Tag>
          <Tag icon={<Table2 className="h-3 w-3" />}>含表 {aggStats.withTable}</Tag>
          <Tag icon={<ListTree className="h-3 w-3" />}>
            平均章节 {aggStats.avgHeadings}
          </Tag>
          <Tag>总字数 {(aggStats.totalChars / 1000).toFixed(0)}k</Tag>
        </div>
      </div>

      <FilterToolbar
        value={filter}
        onChange={setFilter}
        totalCount={questions.length}
        visibleCount={visible.length}
      />
      {visible.length === 0 ? (
        <div className="rounded-md border border-dashed p-10 text-center text-sm text-[var(--color-muted-foreground)]">
          没有匹配的题目，试试调整筛选条件
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map(q => (
            <QuestionCard key={q.id} q={q} />
          ))}
        </div>
      )}
    </div>
  )
}

function Tag({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-0.5">
      {icon}
      {children}
    </span>
  )
}

function computeAggStats(questions: CategoryView['questions']) {
  let withCode = 0
  let withTable = 0
  let totalChars = 0
  let totalHeadings = 0
  for (const q of questions) {
    if (q.codeCount > 0) withCode++
    if (q.hasTable) withTable++
    totalChars += q.chars
    totalHeadings += q.headings.length
  }
  return {
    withCode,
    withTable,
    totalChars,
    avgHeadings: questions.length
      ? (totalHeadings / questions.length).toFixed(1)
      : '0',
  }
}

function CategoryPageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="mb-6 h-8 w-1/3 animate-pulse rounded bg-[var(--color-muted)]/60" />
      <div className="mb-4 h-10 animate-pulse rounded bg-[var(--color-muted)]/40" />
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="h-44 animate-pulse rounded-xl border bg-[var(--color-muted)]/30"
          />
        ))}
      </div>
    </div>
  )
}
