import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, FilePlus2, Loader2, Radar, RefreshCw, Sparkles } from 'lucide-react'
import { getDeliveryOverview } from '../api'
import { AiInspector } from '../components/AiInspector'
import { DeliveryCanvas } from '../components/DeliveryCanvas'
import { DeliveryStatusStrip } from '../components/DeliveryStatusStrip'
import { ProjectRail } from '../components/ProjectRail'
import { PrdDraftDialog } from '../components/PrdDraftDialog'
import { buildProjects, findingsForRequirement } from '../viewModel'

export function DeliveryCenterPage() {
  const navigate = useNavigate()
  const [selectedProject, setSelectedProject] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [draftOpen, setDraftOpen] = useState(false)
  const overviewQuery = useQuery({
    queryKey: ['delivery-overview'],
    queryFn: () => getDeliveryOverview(),
    staleTime: 30_000,
  })
  const overview = overviewQuery.data
  const projects = useMemo(
    () => overview ? buildProjects(overview.requirements, overview.findings) : [],
    [overview],
  )
  const activeProject = projects.some(item => item.name === selectedProject)
    ? selectedProject
    : projects[0]?.name ?? ''
  const projectRequirements = useMemo(
    () => overview?.requirements.filter(item => item.project === activeProject) ?? [],
    [activeProject, overview],
  )

  useEffect(() => {
    if (!projectRequirements.some(item => item.id === selectedId)) {
      setSelectedId(projectRequirements[0]?.id ?? null)
    }
  }, [projectRequirements, selectedId])

  const selected = projectRequirements.find(item => item.id === selectedId) ?? null
  const selectedFindings = overview && selected
    ? findingsForRequirement(overview.findings, selected.id)
    : []

  if (overviewQuery.isLoading) return <LoadingState />
  if (overviewQuery.isError || !overview) {
    return (
      <ErrorState
        message={overviewQuery.error instanceof Error ? overviewQuery.error.message : '请稍后重试'}
        onRetry={() => overviewQuery.refetch()}
      />
    )
  }

  return (
    <div className="min-h-full bg-[var(--color-background)] p-4 text-[var(--color-foreground)] md:p-6">
      <div className="mx-auto max-w-[1800px]">
        <header className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
              <Radar className="h-3.5 w-3.5" />Forge / Delivery Intelligence
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">AI 交付中心</h1>
          </div>
          <div className="flex items-center gap-3 text-[9px] text-[var(--color-muted-foreground)]">
            <span>AI 校准于 {formatTime(overview.generatedAt)}</span>
            <button
              type="button"
              onClick={() => overviewQuery.refetch()}
              className="inline-flex items-center gap-1 hover:text-[var(--color-primary)]"
            >
              <RefreshCw className={`h-3 w-3 ${overviewQuery.isFetching ? 'animate-spin' : ''}`} />刷新
            </button>
            <button
              type="button"
              onClick={() => setDraftOpen(true)}
              className="inline-flex items-center gap-1 border border-[var(--color-primary)]/40 px-2.5 py-1.5 font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
            >
              <FilePlus2 className="h-3 w-3" />起草 PRD
            </button>
          </div>
        </header>

        <DeliveryStatusStrip summary={overview.summary} />

        {overview.warnings.length > 0 && (
          <div className="flex items-start gap-2 border-b border-[var(--color-warning)]/30 px-1 py-3 text-[10px] text-[var(--color-warning)]">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{overview.warnings.join('；')}</span>
          </div>
        )}

        {overview.summary.requirementCount === 0 ? (
          <EmptyState />
        ) : (
          <main className="grid gap-4 pt-4 xl:grid-cols-[220px_minmax(500px,1fr)_360px]">
            <ProjectRail
              projects={projects}
              selected={activeProject}
              onSelect={project => {
                setSelectedProject(project)
                setSelectedId(null)
                setQuery('')
              }}
            />
            <DeliveryCanvas
              project={activeProject}
              requirements={projectRequirements}
              findings={overview.findings}
              query={query}
              onQueryChange={setQuery}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <AiInspector requirement={selected} findings={selectedFindings} />
          </main>
        )}
      </div>
      {draftOpen && (
        <PrdDraftDialog
          initialProject={activeProject}
          onClose={() => setDraftOpen(false)}
          onCreated={sessionId => navigate(`/tools/prd-clarify?sessionId=${encodeURIComponent(sessionId)}`)}
        />
      )}
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-[var(--color-primary)]" />
        <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">正在校准交付事实…</p>
      </div>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="max-w-sm border border-[var(--color-danger)]/30 p-6 text-center">
        <AlertCircle className="mx-auto h-6 w-6 text-[var(--color-danger)]" />
        <h1 className="mt-3 text-sm font-semibold">交付数据加载失败</h1>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{message}</p>
        <button type="button" onClick={onRetry} className="mt-4 text-xs font-medium text-[var(--color-primary)]">重新加载</button>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="border-b border-[var(--color-border)] px-6 py-24 text-center">
      <Sparkles className="mx-auto h-7 w-7 text-[var(--color-primary)]/60" />
      <h2 className="mt-4 text-sm font-semibold">还没有可展示的 PRD</h2>
      <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">完成 PRD 澄清与归档后，这里会自动形成交付空间。</p>
    </div>
  )
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}
