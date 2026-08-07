import { AlertTriangle, Check, CircleDashed, CircleDot, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DeliveryFinding, DeliveryRequirement, DeliveryStageKey, StageStatus } from '../types'
import { requirementProgress } from '../viewModel'
import { documentProfileLabels } from '@/features/prd-clarify/documentProfile'

interface Props {
  requirement: DeliveryRequirement
  findings: DeliveryFinding[]
  selected: boolean
  onSelect: () => void
  onStageSelect: (stage: DeliveryStageKey) => void
}

export function PrdDeliveryTrack({ requirement, findings, selected, onSelect, onStageSelect }: Props) {
  const progress = requirementProgress(requirement)
  const labels = documentProfileLabels(requirement.documentProfile)
  const stages = [
    ['prdDraft', labels.specificationDraft, requirement.stages.prdDraft.status, requirement.stages.prdDraft.score],
    ['prdClarify', labels.specificationClarify, requirement.stages.prdClarify.status, requirement.stages.prdClarify.score],
    ['prd', labels.specification, requirement.stages.prd.status, requirement.stages.prd.score],
    ['tddClarify', labels.planClarify, requirement.stages.tddClarify.status, requirement.stages.tddClarify.score],
    ['tdd', labels.plan, requirement.stages.tdd.status, requirement.stages.tdd.score],
    ['code', 'Code', requirement.stages.code.status, requirement.stages.code.score],
    ['test', 'Test', requirement.stages.test.status, requirement.stages.test.score],
    ['runtime', 'Runtime', requirement.stages.runtime.status, requirement.stages.runtime.score],
  ] as const
  const highRisk = findings.filter(item => item.severity === 'HIGH').length

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') onSelect()
      }}
      className={cn(
        'group relative w-full px-3 py-3 text-left transition-colors',
        selected ? 'bg-[var(--color-primary)]/8' : 'hover:bg-[var(--color-muted)]/55',
      )}
    >
      {selected && <span className="absolute inset-y-2 left-0 w-0.5 bg-[var(--color-primary)]" />}
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-xs font-medium text-[var(--color-foreground)]">{requirement.title}</span>
            {highRisk > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[9px] text-[var(--color-danger)]">
                <AlertTriangle className="h-2.5 w-2.5" />{highRisk} Risk
              </span>
            )}
            {requirement.coverage.partial > 0 && (
              <span className="shrink-0 text-[9px] text-[var(--color-warning)]">◐ Partial {requirement.coverage.partial}</span>
            )}
            {requirement.coverage.missing > 0 && (
              <span className="shrink-0 text-[9px] text-[var(--color-danger)]">× Missing {requirement.coverage.missing}</span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1">
            {stages.map(([key, label, status, score], index) => (
              <div key={key} className="flex items-center">
                {index > 0 && <span className="mx-1 h-px w-3 bg-[var(--color-border)]" />}
                <StageSignal
                  label={label}
                  status={status}
                  score={score}
                  onClick={() => onStageSelect(key)}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 h-px bg-[var(--color-border)]">
            <div
              className="h-px bg-[var(--color-primary)] transition-all"
              style={{ width: `${progress ?? 0}%` }}
            />
          </div>
        </div>
        <div className="w-11 shrink-0 text-right">
          <span className="text-base font-semibold text-[var(--color-foreground)]">{progress == null ? '—' : `${progress}%`}</span>
          <div className="mt-1 text-[8px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
            {requirement.healthGrade}
          </div>
        </div>
      </div>
    </div>
  )
}

function StageSignal({
  label,
  status,
  score,
  onClick,
}: {
  label: string
  status: StageStatus
  score: number | null
  onClick: () => void
}) {
  const Icon = status === 'COMPLETE'
    ? Check
    : status === 'MISSING' || status === 'ERROR'
      ? X
      : status === 'UNAVAILABLE'
        ? CircleDashed
        : CircleDot
  const tone = status === 'COMPLETE'
    ? 'text-[var(--color-success)]'
    : status === 'MISSING' || status === 'ERROR'
      ? 'text-[var(--color-danger)]'
      : status === 'PARTIAL' || status === 'STALE'
        ? 'text-[var(--color-warning)]'
        : 'text-[var(--color-muted-foreground)]'
  return (
    <button
      type="button"
      onClick={event => {
        event.stopPropagation()
        onClick()
      }}
      className={cn(
        'inline-flex items-center gap-1 rounded px-1 py-0.5 text-[9px] outline-none transition-colors',
        'hover:bg-[var(--color-muted)] focus-visible:ring-1 focus-visible:ring-[var(--color-ring)]',
        tone,
      )}
      title={`打开${label}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
      {score != null && score < 100 ? ` ${score}%` : ''}
    </button>
  )
}
