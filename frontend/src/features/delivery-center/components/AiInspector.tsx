import { ArrowUpRight, BrainCircuit, Check, Clock3, CircleDashed, TriangleAlert, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { DeliveryFinding, DeliveryRequirement, ProgressItem, StageStatus } from '../types'

interface Props {
  requirement: DeliveryRequirement | null
  findings: DeliveryFinding[]
}

export function AiInspector({ requirement, findings }: Props) {
  const navigate = useNavigate()
  if (!requirement) {
    return (
      <aside className="flex min-h-[420px] items-center justify-center border border-[var(--color-border)] p-6 text-center">
        <div>
          <BrainCircuit className="mx-auto h-6 w-6 text-[var(--color-muted-foreground)]" />
          <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">选择一条 PRD 轨道进行检查</p>
        </div>
      </aside>
    )
  }

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
  const comparisonItems = [
    ...requirement.progressItems.missing,
    ...requirement.progressItems.partial,
    ...requirement.progressItems.completed,
  ]

  return (
    <aside className="min-w-0 border border-[var(--color-border)] bg-[var(--color-card)]">
      <header className="border-b border-[var(--color-border)] p-5">
        <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">AI Inspector</div>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[9px] text-[var(--color-muted-foreground)]">{requirement.project} / {requirement.module}</div>
            <h2 className="mt-1 text-base font-semibold leading-snug text-[var(--color-card-foreground)]">{requirement.title}</h2>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-2xl font-semibold text-[var(--color-card-foreground)]">{requirement.healthScore}</div>
            <div className="text-[8px] uppercase tracking-wider text-[var(--color-primary)]">Health {requirement.healthGrade}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1 text-[9px] text-[var(--color-muted-foreground)]">
          <Clock3 className="h-2.5 w-2.5" />更新于 {formatTime(requirement.updatedAt)} · 可信度 {requirement.confidence}%
        </div>
        <div className="mt-4 flex items-center">
          {stages.map(([label, status, score], index) => (
            <div key={label} className="flex min-w-0 flex-1 items-center">
              {index > 0 && <span className="h-px flex-1 bg-[var(--color-border)]" />}
              <InspectorStage label={label} status={status} score={score} />
            </div>
          ))}
        </div>
      </header>

      <div className="max-h-[calc(100vh-19rem)] space-y-6 overflow-y-auto p-5">
        {findings.length > 0 && (
          <section>
            <SectionTitle>AI 结论</SectionTitle>
            <div className="mt-2 divide-y divide-[var(--color-border)]">
              {findings.map(finding => (
                <div key={finding.id} className="py-3 first:pt-0">
                  <div className="flex items-start gap-2">
                    <TriangleAlert className={`mt-0.5 h-3 w-3 shrink-0 ${finding.severity === 'HIGH' ? 'text-[var(--color-danger)]' : 'text-[var(--color-warning)]'}`} />
                    <div>
                      <p className="text-[11px] font-medium text-[var(--color-card-foreground)]">{finding.title}</p>
                      <p className="mt-1 text-[9px] leading-relaxed text-[var(--color-muted-foreground)]">{finding.evidence}</p>
                      <p className="mt-1 text-[9px] leading-relaxed text-[var(--color-primary)]">建议：{finding.recommendation}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between">
            <SectionTitle>功能点证据对照</SectionTitle>
            <span className="text-[9px] text-[var(--color-muted-foreground)]">
              {requirement.coverage.completed} ✓ · {requirement.coverage.partial} ◐ · {requirement.coverage.missing} ×
            </span>
          </div>
          {comparisonItems.length === 0 ? (
            <p className="mt-3 text-[10px] text-[var(--color-muted-foreground)]">尚无可解析的代码评估明细。</p>
          ) : (
            <div className="mt-3">
              <div className="grid grid-cols-[1fr_0.72fr_1.15fr] gap-2 border-b border-[var(--color-border)] pb-2 text-[8px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                <span>评估要求</span><span>实现状态</span><span>代码证据</span>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {comparisonItems.map((item, index) => (
                  <EvidenceRow key={`${item.title}-${index}`} item={item} />
                ))}
              </div>
            </div>
          )}
        </section>

        {requirement.alignmentFindings.length > 0 && (
          <section>
            <SectionTitle>PRD vs Code</SectionTitle>
            <div className="mt-2 divide-y divide-[var(--color-border)]">
              {requirement.alignmentFindings.map((item, index) => (
                <div key={`${item.requirement}-${index}`} className="grid gap-1 py-3 text-[9px]">
                  <strong className="text-[11px] text-[var(--color-card-foreground)]">{item.requirement}</strong>
                  <span className="text-[var(--color-muted-foreground)]">要求：{item.expected}</span>
                  <span className="text-[var(--color-muted-foreground)]">代码：{item.actual}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-wrap gap-3 border-t border-[var(--color-border)] pt-4">
          <InspectorLink label="查看 PRD" onClick={() => navigate(requirement.links.prd)} />
          {requirement.links.development && (
            <InspectorLink label="开发会话" onClick={() => navigate(requirement.links.development!)} />
          )}
          <InspectorLink label="项目工作台" onClick={() => navigate(requirement.links.workspace)} />
        </div>
      </div>
    </aside>
  )
}

function InspectorStage({ label, status, score }: { label: string; status: StageStatus; score: number | null }) {
  const Icon = status === 'COMPLETE' ? Check : status === 'MISSING' || status === 'ERROR' ? X : CircleDashed
  const tone = status === 'COMPLETE'
    ? 'text-[var(--color-success)]'
    : status === 'MISSING' || status === 'ERROR'
      ? 'text-[var(--color-danger)]'
      : status === 'PARTIAL' || status === 'STALE'
        ? 'text-[var(--color-warning)]'
        : 'text-[var(--color-muted-foreground)]'
  return (
    <div className={`shrink-0 text-center ${tone}`}>
      <Icon className="mx-auto h-3 w-3" />
      <div className="mt-1 text-[8px]">{label}</div>
      <div className="text-[8px]">{score == null ? '—' : `${score}%`}</div>
    </div>
  )
}

function EvidenceRow({ item }: { item: ProgressItem }) {
  const evidence = item.evidence.join('；') || item.actual || '未提供代码证据'
  const state = item.missing ? `缺失：${item.missing}` : item.implemented ? `已实现：${item.implemented}` : '按评估报告判定'
  return (
    <div className="grid grid-cols-[1fr_0.72fr_1.15fr] gap-2 py-3 text-[9px] leading-relaxed">
      <span className="font-medium text-[var(--color-card-foreground)]">{item.expected || item.title}</span>
      <span className={item.missing ? 'text-[var(--color-danger)]' : item.implemented ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}>
        {state}
      </span>
      <span className="break-words text-[var(--color-muted-foreground)]">{evidence}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-card-foreground)]">{children}</h3>
}

function InspectorLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-[9px] font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)]">
      {label}<ArrowUpRight className="h-2.5 w-2.5" />
    </button>
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
