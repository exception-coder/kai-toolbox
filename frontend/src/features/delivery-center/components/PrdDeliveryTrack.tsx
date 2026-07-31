import { AlertTriangle, Check, CircleDashed, CircleDot, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DeliveryFinding, DeliveryRequirement, StageStatus } from '../types'
import { requirementProgress } from '../viewModel'

interface Props {
  requirement: DeliveryRequirement
  findings: DeliveryFinding[]
  selected: boolean
  onSelect: () => void
}

export function PrdDeliveryTrack({ requirement, findings, selected, onSelect }: Props) {
  const progress = requirementProgress(requirement)
  const stages = [
    ['PRD 草稿', requirement.stages.prdDraft.status, requirement.stages.prdDraft.score],
    ['PRD 澄清', requirement.stages.prdClarify.status, requirement.stages.prdClarify.score],
    ['PRD', requirement.stages.prd.status, requirement.stages.prd.score],
    ['TDD 澄清', requirement.stages.tddClarify.status, requirement.stages.tddClarify.score],
    ['TDD', requirement.stages.tdd.status, requirement.stages.tdd.score],
    ['Code', requirement.stages.code.status, requirement.stages.code.score],
    ['Test', requirement.stages.test.status, requirement.stages.test.score],
    ['Runtime', requirement.stages.runtime.status, requirement.stages.runtime.score],
  ] as const
  const highRisk = findings.filter(item => item.severity === 'HIGH').length

  return (
    <button
      type="button"
      onClick={onSelect}
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
            {stages.map(([label, status, score], index) => (
              <div key={label} className="flex items-center">
                {index > 0 && <span className="mx-1 h-px w-3 bg-[var(--color-border)]" />}
                <StageSignal label={label} status={status} score={score} />
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
    </button>
  )
}

function StageSignal({ label, status, score }: { label: string; status: StageStatus; score: number | null }) {
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
    <span className={cn('inline-flex items-center gap-1 text-[9px]', tone)}>
      <Icon className="h-2.5 w-2.5" />
      {label}
      {score != null && score < 100 ? ` ${score}%` : ''}
    </span>
  )
}
