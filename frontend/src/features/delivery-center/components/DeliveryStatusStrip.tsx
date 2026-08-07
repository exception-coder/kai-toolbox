import { AlertTriangle, BrainCircuit, CircleDot, Gauge } from 'lucide-react'
import type { DeliverySummary } from '../types'

export function DeliveryStatusStrip({ summary }: { summary: DeliverySummary }) {
  const stages = [
    ['需求规格', summary.prdCompletion],
    ['执行方案', summary.tddCompletion],
    ['Code', summary.codeProgress],
    ['评估覆盖', summary.assessmentCoverage],
    ['可信度', summary.confidence],
  ] as const

  return (
    <section className="border-y border-[var(--color-border)] py-3">
      <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
        <div className="flex items-center gap-3">
          <Gauge className="h-4 w-4 text-[var(--color-primary)]" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
            Ground Truth
          </span>
          <strong className="text-xl font-semibold text-[var(--color-foreground)]">{summary.overallProgress}%</strong>
          <span className="text-[10px] text-[var(--color-muted-foreground)]">
            Health {summary.healthScore} / {summary.healthGrade}
          </span>
        </div>
        <div className="hidden h-6 w-px bg-[var(--color-border)] md:block" />
        <div className="flex flex-1 flex-wrap gap-x-6 gap-y-2">
          {stages.map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-1.5 text-[11px]">
              <span className="text-[var(--color-muted-foreground)]">{label}</span>
              <span className="font-semibold text-[var(--color-foreground)]">{value == null ? '—' : `${value}%`}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 text-[10px]">
          <span className="inline-flex items-center gap-1 text-[var(--color-danger)]">
            <AlertTriangle className="h-3 w-3" />风险 {summary.highRiskCount}
          </span>
          <span className="inline-flex items-center gap-1 text-[var(--color-warning)]">
            <CircleDot className="h-3 w-3" />待评估 {summary.unassessedCount}
          </span>
          <span className="inline-flex items-center gap-1 text-[var(--color-muted-foreground)]">
            <BrainCircuit className="h-3 w-3" />需求 {summary.requirementCount}
          </span>
        </div>
      </div>
      <div className="mt-3 h-px bg-[var(--color-muted)]">
        <div className="h-px bg-[var(--color-primary)]" style={{ width: `${summary.overallProgress}%` }} />
      </div>
    </section>
  )
}
