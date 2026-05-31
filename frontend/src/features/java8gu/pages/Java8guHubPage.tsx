import { useEffect, useMemo, useState } from 'react'
import { Library, ListChecks, RefreshCw, Search, Settings2, Sparkles } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useFeatureConfig } from '@/lib/featureConfig'
import {
  applyDataSource,
  DEFAULT_DATA_SOURCE,
  LEGACY_LOCALSTORAGE_KEY,
  loadIndex,
} from '../data'
import type { DataSourceConfig } from '../data'
import type { Java8guIndex } from '../types'
import { CategoryCard } from '../components/CategoryCard'
import { DataSourceDialog } from '../components/DataSourceDialog'

export function Java8guHubPage() {
  const [index, setIndex] = useState<Java8guIndex | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [forceNext, setForceNext] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)

  const {
    config: source,
    isReady: configReady,
    setConfig: persistSource,
  } = useFeatureConfig<DataSourceConfig>('java8gu', {
    defaults: DEFAULT_DATA_SOURCE,
    legacy: { key: LEGACY_LOCALSTORAGE_KEY },
  })

  // 把最新 cfg 注入 module 单例 —— loadIndex / loadMarkdown 内部仍同步读
  // cfg 内容变化会触发 resetRuntimeState，下一次 loadIndex 按新 cfg 拉取
  useEffect(() => {
    if (!configReady) return
    applyDataSource(source)
  }, [configReady, source])

  useEffect(() => {
    if (!configReady) return
    let cancelled = false
    setIndex(null)
    setError(null)
    setProgress(null)
    loadIndex({
      onProgress: (done, total) => {
        if (!cancelled) setProgress({ done, total })
      },
      forceRefresh: forceNext,
    })
      .then(idx => {
        if (!cancelled) setIndex(idx)
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey, configReady])

  const handleSaved = async (cfg: DataSourceConfig) => {
    await persistSource(cfg)
    // 写入成功后强制下次走新 sha 校验，避免命中旧 cfg 的本地索引缓存
    setForceNext(true)
    setReloadKey(k => k + 1)
  }

  const handleRefresh = () => {
    setForceNext(true)
    setReloadKey(k => k + 1)
  }

  const filtered = useMemo(() => {
    if (!index) return []
    const kw = search.trim().toLowerCase()
    if (!kw) return index.categories
    return index.categories.filter(c => c.label.toLowerCase().includes(kw))
  }, [index, search])

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Hero */}
      <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border bg-[var(--color-card)] px-3 py-1 text-[11px] font-medium text-[var(--color-muted-foreground)] sm:text-xs">
            <Library className="h-3.5 w-3.5" />
            Java 八股·卡片回顾
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Java 面试知识点
            <span className="mx-1.5 text-[var(--color-muted-foreground)]">·</span>
            <span className="text-[var(--color-primary)]">由浅入深</span>
          </h1>
          <p className="mt-1.5 hidden max-w-2xl text-sm text-[var(--color-muted-foreground)] sm:block">
            实时拉取 GitHub 仓库 exception-coder/JobInterviewLog 的 java8gu-速记版 目录，按难度分桶 + 关键词 chip + 章节计数，单页扫读。点开任意分类卡片进入题目卡片视图。
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Stat
            icon={<ListChecks className="h-4 w-4" />}
            label="题目"
            value={index ? index.totalQuestions.toString() : '—'}
          />
          <Stat
            icon={<Sparkles className="h-4 w-4" />}
            label="分类"
            value={index ? index.categories.length.toString() : '—'}
          />
        </div>
      </div>

      {/* 搜索 + 数据源 */}
      <div className="mb-5 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="按分类名搜索…"
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={!index && !error}
            title="重新打 GitHub Trees API 校验 sha 并按需重拉"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">刷新</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfigOpen(true)}
            title={`${source.owner}/${source.repo}@${source.branch}:${source.dir || '/'}`}
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">数据源</span>
            <span className="hidden font-mono text-[10.5px] text-[var(--color-muted-foreground)] sm:inline">
              {source.owner}/{source.repo}@{source.branch}
            </span>
            <span className="sm:hidden">数据源</span>
          </Button>
        </div>
      </div>

      <DataSourceDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        initial={source}
        onSaved={handleSaved}
      />

      {/* 错误态 */}
      {error && (
        <div className="rounded-lg border border-rose-300/60 bg-rose-50/60 p-4 text-sm text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300">
          <div className="font-medium">题库加载失败</div>
          <div className="mt-1 text-xs opacity-80">{error}</div>
        </div>
      )}

      {/* 加载态 */}
      {!index && !error && (
        <>
          {progress && progress.total > 0 && (
            <div className="mb-4 rounded-md border bg-[var(--color-card)] px-3 py-2 text-[11.5px] text-[var(--color-muted-foreground)] sm:text-xs">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span>从 GitHub 拉取题库… {progress.done} / {progress.total}</span>
                <span className="tabular-nums">
                  {Math.round((progress.done / progress.total) * 100)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-[var(--color-muted)]/40">
                <div
                  className="h-full bg-[var(--color-primary)]/80 transition-all"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-xl border bg-[var(--color-muted)]/30"
              />
            ))}
          </div>
        </>
      )}

      {/* 类目网格 */}
      {index && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(c => (
            <CategoryCard key={c.id} category={c} />
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex flex-1 items-center gap-2 rounded-lg border bg-[var(--color-card)] px-3 py-1.5 sm:flex-initial">
      <span className="text-[var(--color-primary)]">{icon}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-semibold tabular-nums leading-none">
          {value}
        </span>
        <span className="text-[11px] text-[var(--color-muted-foreground)]">{label}</span>
      </div>
    </div>
  )
}
