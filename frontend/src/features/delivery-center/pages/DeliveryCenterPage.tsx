import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, FilePlus2, Loader2, Radar, RefreshCw, Sparkles, Table2 } from 'lucide-react'
import { getDeliveryOverview } from '../api'
import type { FeishuRequirementRecord } from '../api'
import type { PrdBusinessFields } from '@/features/prd-clarify/types'
import { AiInspector } from '../components/AiInspector'
import { DeliveryCanvas } from '../components/DeliveryCanvas'
import { DeliveryStatusStrip } from '../components/DeliveryStatusStrip'
import { ProjectRail } from '../components/ProjectRail'
import { PrdDraftDialog } from '../components/PrdDraftDialog'
import { FeishuRequirementImportDialog } from '../components/FeishuRequirementImportDialog'
import { DeliveryStageDialog } from '../components/DeliveryStageDialog'
import { buildProjects, findingsForRequirement } from '../viewModel'
import type { DeliveryRequirement, DeliveryStageKey } from '../types'

export function DeliveryCenterPage() {
  const navigate = useNavigate()
  const [selectedProject, setSelectedProject] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [draftOpen, setDraftOpen] = useState(false)
  const [feishuOpen, setFeishuOpen] = useState(false)
  const [stageDialog, setStageDialog] = useState<{
    requirement: DeliveryRequirement
    stage: DeliveryStageKey
  } | null>(null)
  const [importedDraft, setImportedDraft] = useState<{
    title: string
    businessFields: PrdBusinessFields
  } | null>(null)
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
              onClick={() => setFeishuOpen(true)}
              className="inline-flex items-center gap-1 border border-[#3370ff]/40 px-2.5 py-1.5 font-medium text-[#3370ff] hover:bg-[#3370ff]/10"
            >
              <Table2 className="h-3 w-3" />飞书需求
            </button>
            <button
              type="button"
              onClick={() => {
                setImportedDraft(null)
                setDraftOpen(true)
              }}
              className="inline-flex items-center gap-1 border border-[var(--color-primary)]/40 px-2.5 py-1.5 font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
            >
              <FilePlus2 className="h-3 w-3" />起草需求
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
              onStageSelect={(requirement, stage) => {
                setSelectedId(requirement.id)
                if (stage === 'code' && requirement.links.development) {
                  navigate(requirement.links.development)
                  return
                }
                setStageDialog({ requirement, stage })
              }}
            />
            <AiInspector
              requirement={selected}
              findings={selectedFindings}
              onStageSelect={stage => {
                if (!selected) return
                if (stage === 'code' && selected.links.development) {
                  navigate(selected.links.development)
                  return
                }
                setStageDialog({ requirement: selected, stage })
              }}
            />
          </main>
        )}
      </div>
      {draftOpen && (
        <PrdDraftDialog
          initialProject={activeProject}
          initialShortTitle={importedDraft?.title}
          initialBusinessFields={importedDraft?.businessFields}
          onClose={() => setDraftOpen(false)}
          onCreated={sessionId => navigate(`/tools/prd-clarify?sessionId=${encodeURIComponent(sessionId)}`)}
        />
      )}
      {feishuOpen && (
        <FeishuRequirementImportDialog
          onClose={() => setFeishuOpen(false)}
          onSelect={(record, _sourceUrl) => {
            setImportedDraft({
              title: record.title,
              businessFields: mapFeishuBusinessFields(record),
            })
            setFeishuOpen(false)
            setDraftOpen(true)
          }}
        />
      )}
      {stageDialog && (
        <DeliveryStageDialog
          requirement={stageDialog.requirement}
          stage={stageDialog.stage}
          onClose={() => setStageDialog(null)}
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
      <h2 className="mt-4 text-sm font-semibold">还没有可展示的需求</h2>
      <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">完成需求规格澄清与归档后，这里会自动形成交付空间。</p>
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

function mapFeishuBusinessFields(record: FeishuRequirementRecord): PrdBusinessFields {
  return {
    requirementDetail: findField(record, '需求详情', 'fld4MyICot'),
    businessBackground: findField(record, '需求背景/业务痛点', '需求背景', '业务痛点', 'fld57ObEhK'),
    businessRequirementType: normalizeBusinessRequirementType(
      findField(record, '需求类型', 'fld2JgJuVL'),
    ),
    requirementSoftware: findField(record, '需求软件', 'fld43K1LNl'),
    initiatingDepartment: findField(record, '发起部门', 'fld6iE5Iix'),
    requester: findField(record, '提出人', 'fldeHXs8Cx'),
    requestedAt: normalizeRequestedAt(findField(record, '提出日期', 'fld1K9bTud')),
    attachments: findField(record, '附件', 'fld79KCQet'),
    followUpRecords: findField(record, '跟进记录', '处理反馈', 'fldwa51TeQ'),
  }
}

function findField(record: FeishuRequirementRecord, ...names: string[]) {
  for (const name of names) {
    const value = record.fields[name]
    if (value?.trim()) return value.trim()
  }
  return ''
}

function normalizeBusinessRequirementType(value: string) {
  const labels: Record<string, string> = {
    optki0Xnkb: '功能优化',
    optQ9FhwmC: '新需求',
    optaw9hHim: '数据异常',
    optph80OtF: '系统缺陷',
  }
  return labels[value] ?? value
}

function normalizeRequestedAt(value: string) {
  if (!/^\d{12,}$/.test(value)) return value
  const timestamp = Number(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : value
}
