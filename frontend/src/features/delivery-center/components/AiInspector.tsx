import { ArrowUpRight, BrainCircuit, Check, Clock3, CircleDashed, Loader2, ShieldCheck, TriangleAlert, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { DeliveryFinding, DeliveryRequirement, DeliveryStageKey, ProgressItem, StageStatus } from '../types'
import { startDeliveryVerification } from '../api'
import { documentLabels } from '@/features/prd-clarify/public-api'

interface Props {
  requirement: DeliveryRequirement | null
  findings: DeliveryFinding[]
  onStageSelect: (stage: DeliveryStageKey) => void
}

export function AiInspector({ requirement, findings, onStageSelect }: Props) {
  const navigate = useNavigate()
  if (!requirement) {
    return (
      <aside className="flex min-h-[420px] items-center justify-center border border-[var(--color-border)] p-6 text-center">
        <div>
          <BrainCircuit className="mx-auto h-6 w-6 text-[var(--color-muted-foreground)]" />
          <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">选择一条需求轨道进行检查</p>
        </div>
      </aside>
    )
  }

  const labels = documentLabels
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
  const comparisonItems = [
    ...requirement.progressItems.missing,
    ...requirement.progressItems.partial,
    ...requirement.progressItems.completed,
  ]
  const excludedItems = requirement.progressItems.excluded ?? []

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
          {stages.map(([key, label, status, score], index) => (
            <div key={key} className="flex min-w-0 flex-1 items-center">
              {index > 0 && <span className="h-px flex-1 bg-[var(--color-border)]" />}
              <InspectorStage label={label} status={status} score={score} onClick={() => onStageSelect(key)} />
            </div>
          ))}
        </div>
      </header>

      <div className="max-h-[calc(100vh-19rem)] space-y-6 overflow-y-auto p-5">
        <VerificationPanel requirement={requirement} />

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

        {excludedItems.length > 0 && (
          <section>
            <div className="flex items-center justify-between">
              <SectionTitle>观察项（不计分）</SectionTitle>
              <span className="text-[9px] text-sky-600">测试不纳入 · {excludedItems.length} 项</span>
            </div>
            <div className="mt-2 divide-y divide-[var(--color-border)]">
              {excludedItems.map((item, index) => (
                <div key={`${item.title}-${index}`} className="py-3 text-[9px] leading-relaxed">
                  <div className="flex items-start justify-between gap-3">
                    <strong className="text-[11px] text-[var(--color-card-foreground)]">{item.title}</strong>
                    <span className="shrink-0 font-semibold text-sky-600">0 分</span>
                  </div>
                  <p className="mt-1 text-[var(--color-muted-foreground)]">{item.actual || item.missing || item.implemented || '已核查，本次不纳入计分'}</p>
                  {item.evidence.length > 0 && <p className="mt-1 break-words text-[var(--color-primary)]">证据：{item.evidence.join('；')}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {requirement.alignmentFindings.length > 0 && (
          <section>
            <SectionTitle>{`${labels.specification} vs Code`}</SectionTitle>
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
          <InspectorLink label={`查看${labels.specification}`} onClick={() => navigate(requirement.links.prd)} />
          {requirement.links.development && (
            <InspectorLink label="开发会话" onClick={() => navigate(requirement.links.development!)} />
          )}
          <InspectorLink label="项目工作台" onClick={() => navigate(requirement.links.workspace)} />
        </div>
      </div>
    </aside>
  )
}

function VerificationPanel({ requirement }: { requirement: DeliveryRequirement }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (commandId: string) => startDeliveryVerification(requirement.id, commandId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['delivery-overview'] }),
  })
  const run = requirement.verification
  const running = run?.status === 'RUNNING'
  const statusLabel = run
    ? run.stale
      ? '已过期'
      : {
          RUNNING: '执行中',
          SUCCEEDED: '已通过',
          FAILED: '未通过',
          ERROR: '执行异常',
        }[run.status]
    : '未验证'
  const statusTone = run?.status === 'SUCCEEDED' && !run.stale
    ? 'text-[var(--color-success)]'
    : run?.status === 'FAILED' || run?.status === 'ERROR' || run?.stale
      ? 'text-[var(--color-danger)]'
      : 'text-[var(--color-muted-foreground)]'

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>构建 / 测试硬证据</SectionTitle>
        <span className={`text-[9px] font-medium ${statusTone}`}>{statusLabel}</span>
      </div>
      <div className="mt-2 border border-[var(--color-border)] p-3">
        <div className="flex items-start gap-2 text-[9px] text-[var(--color-muted-foreground)]">
          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-[var(--color-primary)]" />
          <span>
            {requirement.evidenceMode === 'VERIFIED_LEDGER'
              ? `已验证 ${requirement.verifiedClaimCount} 个源码声明`
              : '当前进度报告尚未形成结构化源码证据'}
            {requirement.invalidEvidenceCount > 0 && ` · ${requirement.invalidEvidenceCount} 个坐标无效`}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {requirement.availableVerificationCommands.map(command => (
            <button
              key={command.id}
              type="button"
              disabled={running || mutation.isPending}
              onClick={() => mutation.mutate(command.id)}
              className="inline-flex items-center gap-1 border border-[var(--color-primary)]/40 px-2 py-1 text-[9px] font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {(running || mutation.isPending) && mutation.variables === command.id
                ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                : <ShieldCheck className="h-2.5 w-2.5" />}
              {command.label}
            </button>
          ))}
          {requirement.availableVerificationCommands.length === 0 && (
            <span className="text-[9px] text-[var(--color-muted-foreground)]">服务端未配置验证命令</span>
          )}
        </div>
        {run && (
          <div className="mt-3 space-y-1 border-t border-[var(--color-border)] pt-2 text-[8px] text-[var(--color-muted-foreground)]">
            <p>Git {run.gitHead.slice(0, 8)} · {run.commandId}{run.testCount != null ? ` · ${run.testCount} tests` : ''}</p>
            {run.lastError && <p className="text-[var(--color-danger)]">{run.lastError}</p>}
            {run.outputSummary && <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words bg-[var(--color-muted)]/40 p-2">{run.outputSummary}</pre>}
          </div>
        )}
        {mutation.isError && (
          <p className="mt-2 text-[9px] text-[var(--color-danger)]">
            {mutation.error instanceof Error ? mutation.error.message : '启动验证失败'}
          </p>
        )}
      </div>
    </section>
  )
}

function InspectorStage({
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
  const Icon = status === 'COMPLETE' ? Check : status === 'MISSING' || status === 'ERROR' ? X : CircleDashed
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
      onClick={onClick}
      className={`shrink-0 rounded px-0.5 py-1 text-center outline-none hover:bg-[var(--color-muted)] focus-visible:ring-1 focus-visible:ring-[var(--color-ring)] ${tone}`}
      title={`打开${label}`}
    >
      <Icon className="mx-auto h-3 w-3" />
      <div className="mt-1 text-[8px]">{label}</div>
      <div className="text-[8px]">{score == null ? '—' : `${score}%`}</div>
    </button>
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
