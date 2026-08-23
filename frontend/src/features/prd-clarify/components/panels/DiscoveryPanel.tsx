import { ArrowLeft, BookOpen, Database, GitBranch, Loader2, MapPinned, RotateCcw } from 'lucide-react'
import type { PrdDiscoveryRunView } from '../../types'
import type { ClarifyEngine } from '../dialogs/StartClarifyDialog'

interface DiscoveryPanelProps {
  run?: PrdDiscoveryRunView
  starting: boolean
  failed: boolean
  error?: string | null
  onRetry: () => void
  onBack: () => void
}

const STAGE_LABEL: Record<PrdDiscoveryRunView['stage'], string> = {
  QUEUED: '后台任务已建立，等待 Vibe Coding 执行',
  COLLECTING_EVIDENCE: '正在收集业务知识、代码图谱、DDL 与路由证据',
  VIBE_EXECUTING: 'Vibe Coding 正在整理初始化规格',
  VALIDATING: '正在检查规格结构、证据与开放问题',
  PUBLISHING: '检查通过，正在固化初始化规格',
  COMPLETED: '探索完成',
  FAILED: '探索未完成',
}

/** 后台探索进度视图；页面离开或刷新不会取消 Vibe Coding 任务。 */
export function DiscoveryPanel({ run, starting, failed, error, onRetry, onBack }: DiscoveryPanelProps) {
  const progress = run?.progress ?? (starting ? 3 : 0)
  const statusText = starting
    ? '正在创建探索会话并登记后台任务'
    : run ? STAGE_LABEL[run.stage] : '正在读取后台探索进度'
  const validationGaps = parseValidationGaps(run?.validationJson)
  return (
    <main className="min-w-0 flex-1 overflow-y-auto px-6 py-8 md:px-12">
      <div className="mx-auto max-w-4xl">
        <header className="border-b border-[var(--color-border)] pb-6">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
            Evidence discovery
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {failed ? '本次探索未形成初始化规格' : '正在探索现有系统'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-muted-foreground)]">
            {failed
              ? '需求线索和探索记录已保留。重新探索会在后台直接生成完整规格，不再进入回复式问答；需要需求方判定的内容会写入初始化规格。'
              : 'Forge 已把探索交给后台 Vibe Coding 会话。你可以离开此页，回来后会继续追踪同一任务。'}
          </p>
        </header>

        <section className="grid gap-px border-b border-[var(--color-border)] py-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [BookOpen, '业务知识', '对象、状态与业务规则'],
            [GitBranch, 'Graphify', '模块关系与候选实现'],
            [Database, '关键 DDL', '表、字段、索引与约束'],
            [MapPinned, '路径路由', 'URL、Action 与页面入口'],
          ].map(([Icon, title, detail]) => {
            const SourceIcon = Icon as typeof BookOpen
            return (
              <div key={title as string} className="flex items-start gap-3 py-2 sm:pr-5">
                <SourceIcon className="mt-0.5 h-4 w-4 text-[var(--color-primary)]" />
                <div>
                  <div className="text-sm font-medium">{title as string}</div>
                  <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">{detail as string}</div>
                </div>
              </div>
            )
          })}
        </section>

        <section className="py-6" aria-live="polite">
          {failed ? (
            <DiscoveryFailure
              run={run}
              error={error}
              validationGaps={validationGaps}
              onRetry={onRetry}
              onBack={onBack}
            />
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary)]" />
                <span>{statusText}</span>
                {run && run.attempt > 0 && (
                  <span className="ml-auto text-xs">完成性循环 {run.attempt}/{run.maxAttempts}</span>
                )}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-muted)]/60" aria-label={`探索进度 ${progress}%`}>
                <div
                  className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-500"
                  style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
                />
              </div>
              <div className="mt-4 border-y border-[var(--color-border)] py-4 text-xs text-[var(--color-muted-foreground)]">
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <span>进度 {progress}%</span>
                  <span>检查准则 {run?.criteriaVersion ?? 'initial-spec-quality-v1'}</span>
                  {run?.vibeSessionId && <span>执行会话 {shortId(run.vibeSessionId)}</span>}
                </div>
                {run?.attempt && run.attempt > 1 ? (
                  <p className="mt-2">上一轮没有满足完成条件，后台正携带缺口继续修正，无需人工重复提交。</p>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}

function DiscoveryFailure({
  run,
  error,
  validationGaps,
  onRetry,
  onBack,
}: {
  run?: PrdDiscoveryRunView
  error?: string | null
  validationGaps: string[]
  onRetry: () => void
  onBack: () => void
}) {
  return (
    <div className="border-l-2 border-red-400/70 pl-4 sm:pl-5">
      <p className="text-sm font-medium text-[var(--color-foreground)]">后台执行已停止</p>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--color-muted-foreground)]">
        {error || run?.lastError || 'Vibe Coding 未能产出通过完成性检查的初始化规格。'}
      </p>

      {validationGaps.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-[var(--color-foreground)]">尚未满足的规格条件</p>
          <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[var(--color-muted-foreground)]">
            {validationGaps.slice(0, 3).map(gap => <li key={gap}>— {gap}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--color-muted-foreground)]">
        <span>已执行 {run?.attempt ?? 0}/{run?.maxAttempts ?? 3} 次</span>
        <span>检查准则 {run?.criteriaVersion ?? 'initial-spec-quality-v1'}</span>
        {run?.vibeSessionId && <span>执行会话 {shortId(run.vibeSessionId)}</span>}
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        >
          <RotateCcw className="h-4 w-4" />
          重新后台探索
        </button>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        >
          <ArrowLeft className="h-4 w-4" />
          返回想法修改
        </button>
      </div>
    </div>
  )
}

export function RevisionPreparingPanel({
  engine,
  stage,
}: {
  engine: ClarifyEngine
  stage: 'reading' | 'creating'
}) {
  const engineName = engine === 'codex' ? 'Codex' : 'Claude Code'
  const stages = [
    { key: 'reading', label: '读取原核心规格和版本上下文' },
    { key: 'creating', label: '创建修订任务并保存执行引擎' },
    { key: 'discovery', label: '后台探索并生成新的初始化规格' },
  ] as const
  const activeIndex = stage === 'reading' ? 0 : 1

  return (
    <main className="min-w-0 flex-1 overflow-y-auto px-6 py-8 md:px-12" aria-live="polite">
      <div className="mx-auto max-w-4xl">
        <header className="border-b border-[var(--color-border)] pb-6">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
            Revision discovery
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">正在准备重新探索</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-muted-foreground)]">
            Forge 会结合原核心规格、本次变更和现有系统证据，直接生成新的初始化规格。需要需求方决定的事项会保留在规格中，不会逐题追问。
          </p>
        </header>

        <section className="py-6">
          <div className="mb-5 flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary)]" />
            <span>{engineName} 正在准备后台任务</span>
          </div>
          <ol className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
            {stages.map((item, index) => (
              <li key={item.key} className="flex min-h-12 items-center gap-3 py-3 text-sm">
                <span className={`h-1.5 w-1.5 rounded-full ${
                  index <= activeIndex ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border-strong)]'
                }`} />
                <span className={index <= activeIndex ? 'text-[var(--color-foreground)]' : 'text-[var(--color-muted-foreground)]'}>
                  {item.label}
                </span>
                {index === activeIndex && <span className="ml-auto text-xs text-[var(--color-muted-foreground)]">进行中</span>}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs leading-5 text-[var(--color-muted-foreground)]">
            任务登记后即可离开此页，后台执行不会依赖当前页面连接。
          </p>
        </section>
      </div>
    </main>
  )
}

function shortId(value: string) {
  return value.length > 20 ? `${value.slice(0, 12)}…${value.slice(-6)}` : value
}

function parseValidationGaps(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as { gaps?: unknown }
    return Array.isArray(parsed.gaps)
      ? parsed.gaps.filter((gap): gap is string => typeof gap === 'string' && gap.trim().length > 0)
      : []
  } catch {
    return []
  }
}
