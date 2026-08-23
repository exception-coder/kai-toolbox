import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { retryPlanningAssessment } from '../api'
import type { PlanningAssessmentPayload, PlanningConfidence, PlanningEvidenceTrace, ReqItemView } from '../types'

const CONFIDENCE_LABEL: Record<PlanningConfidence, string> = {
  HIGH: '高',
  MEDIUM: '中',
  LOW: '低',
}

const WORK_PACKAGE_LABEL: Record<string, string> = {
  DISCOVERY_DESIGN: '探索与设计',
  BACKEND: '后端实现',
  FRONTEND: '前端实现',
  DATA: '数据变更',
  INTEGRATION: '联调集成',
  TEST_VERIFICATION: '测试验证',
}

const EVIDENCE_SOURCE_LABEL: Record<string, string> = {
  DOMAIN_KNOWLEDGE: '业务知识',
  GRAPHIFY: '代码图谱',
  DDL: '数据库 DDL',
  ROUTE_MAP: '路由映射',
}

const EVIDENCE_STATUS_LABEL: Record<string, string> = {
  HIT: '已命中',
  SOURCE_MISSING: '数据源缺失',
  NO_HIT_OR_ERROR: '未命中或调用异常',
  NOT_APPLICABLE: '不适用',
  NOT_INVOKED: '未调用',
}

/** 在需求详情中展示可追溯的初始化规格规划评估。 */
export function PlanningAssessmentSection({ item }: { item: ReqItemView }) {
  const queryClient = useQueryClient()
  const assessment = item.planningAssessment
  const payload = parsePlanningAssessmentPayload(assessment?.payloadJson)
  const evidenceTrace = parsePlanningEvidenceTrace(assessment?.evidenceTraceJson)
  const retry = useMutation({
    mutationFn: () => retryPlanningAssessment(item.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reqpool'] }),
  })
  const legacyCriteria = assessment?.status === 'COMPLETED'
    && assessment.criteriaVersion !== 'initial-spec-planning-v3'

  if (!assessment) {
    return item.prdSessionId ? (
      <section className="border-y border-[var(--color-border)] py-4">
        <h3 className="text-xs font-semibold">初始化规格规划评估</h3>
        <p className="mt-2 text-[11px] leading-5 text-[var(--color-muted-foreground)]">
          初始化规格确认后会自动按业务领域拆分功能，并生成可追溯的规划工时。
        </p>
      </section>
    ) : null
  }

  if (assessment.status === 'RUNNING') {
    return (
      <section className="border-y border-[var(--color-border)] py-4">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" />
          正在生成领域功能与规划工时
        </div>
        <p className="mt-2 text-[11px] leading-5 text-[var(--color-muted-foreground)]">
          评估在后台运行，可以关闭面板。准则 {assessment.criteriaVersion}。
        </p>
        <PlanningEvidenceTracePanel trace={evidenceTrace} />
      </section>
    )
  }

  if (assessment.status === 'FAILED' || !payload) {
    const failure = describePlanningAssessmentFailure(assessment.errorMessage)
    return (
      <section className="border-y border-[var(--color-border)] py-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-semibold">规划评估未完成</h3>
            <p className="mt-1 text-[11px] font-medium leading-5 text-[var(--color-foreground)]/80">
              {failure.reason}
            </p>
            <p className="mt-1 text-[10px] leading-4 text-[var(--color-muted-foreground)]">
              {failure.recovery}
            </p>
            {retry.isError && (
              <p role="alert" className="mt-2 text-[10px] leading-4 text-red-600 dark:text-red-400">
                重试请求未提交：{retry.error instanceof Error ? retry.error.message : '服务暂时不可用'}
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={retry.isPending}
            onClick={() => retry.mutate()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-[10px] font-medium transition-colors hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50"
          >
            {retry.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            重试
          </button>
        </div>
        <PlanningEvidenceTracePanel trace={evidenceTrace} />
      </section>
    )
  }

  return (
    <section className="border-y border-[var(--color-border)] py-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] text-[var(--color-muted-foreground)]">预计投入</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {formatPlanningDays(payload.personDaysMin)}–{formatPlanningDays(payload.personDaysMax)}
            <span className="ml-1 text-[10px] font-normal">人日</span>
          </div>
          <div className="mt-1 text-[9px] text-[var(--color-muted-foreground)]">{payload.hoursMin}–{payload.hoursMax} 有效小时 · {payload.effectiveHoursPerPersonDay} 小时/人日</div>
        </div>
        <div className="text-right text-[10px] leading-5 text-[var(--color-muted-foreground)]">
          评估信心 {CONFIDENCE_LABEL[payload.confidence]}
        </div>
      </div>
      {legacyCriteria && <div className="mt-3 flex items-start justify-between gap-3 border-l-2 border-amber-300 pl-3 text-[10px] leading-5"><div><div className="font-semibold">这是旧版技术工作包口径</div><div className="text-[var(--color-muted-foreground)]">旧版可能重复累计公共探索、联调和回归成本，建议按新版业务功能口径重新评估。</div></div><button type="button" disabled={retry.isPending} onClick={() => retry.mutate()} className="shrink-0 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 font-medium hover:bg-[var(--color-muted)] disabled:opacity-50">{retry.isPending ? '提交中…' : '重新评估'}</button></div>}
      <p className="mt-3 text-[11px] leading-5 text-[var(--color-foreground)]/80">{payload.summary}</p>
      <PlanningEvidenceTracePanel trace={evidenceTrace} />
      <div className="mt-4 divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
        {payload.capabilities.map(capability => (
          <div key={capability.id} className="py-3">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-xs font-medium">{capability.name}</span>
                <span className="mt-1 block text-[10px] leading-4 text-[var(--color-muted-foreground)]">{capability.businessOutcome}</span>
              </span>
              <span className="shrink-0 text-xs font-semibold tabular-nums">{formatPlanningDays(capability.hoursMin / payload.effectiveHoursPerPersonDay)}–{formatPlanningDays(capability.hoursMax / payload.effectiveHoursPerPersonDay)} 人日</span>
            </div>
            <details className="mt-2 text-[10px] text-[var(--color-muted-foreground)]"><summary className="cursor-pointer list-none py-1 font-medium hover:text-[var(--color-foreground)]">评估依据</summary><p className="mt-1 leading-4">{capability.scope}</p><div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">{capability.workPackages.filter(work => work.hoursMax > 0).map(work => <div key={work.type} className="flex items-center justify-between gap-2"><span className="truncate">{WORK_PACKAGE_LABEL[work.type] || work.type}</span><span className="shrink-0 tabular-nums">{work.hoursMin}–{work.hoursMax}h</span></div>)}</div></details>
            {(capability.risks.length > 0 || capability.dependencies.length > 0) && (
              <p className="mt-3 text-[10px] leading-4 text-amber-700 dark:text-amber-300">
                {[...capability.dependencies, ...capability.risks].join('；')}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-[var(--color-muted-foreground)]">
        <span>准则 {assessment.criteriaVersion}</span>
        <span>Prompt {assessment.promptVersion}</span>
        <span>输入 {assessment.inputHash.slice(0, 10)}</span>
        {assessment.completedAt && <span>{new Date(assessment.completedAt).toLocaleString()}</span>}
      </div>
    </section>
  )
}

function PlanningEvidenceTracePanel({ trace }: { trace: PlanningEvidenceTrace | null }) {
  if (!trace) {
    return <div className="mt-3 border-l-2 border-amber-300 pl-3 text-[10px] leading-4 text-[var(--color-muted-foreground)]">该历史评估未记录证据调用轨迹，无法反推是知识缺失还是未成功查询。请从规格探索重新确认以生成完整轨迹。</div>
  }
  return (
    <details className="mt-4 border-y border-[var(--color-border)] py-3 text-[10px]">
      <summary className="cursor-pointer list-none font-semibold">证据路由与查询轨迹</summary>
      <div className="mt-2 text-[var(--color-muted-foreground)]">项目 {trace.project || '未路由'} · 模块 {trace.module || '未指定'} · {new Date(trace.capturedAt).toLocaleString()}</div>
      <div className="mt-3 divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
        {trace.sources.map(source => (
          <details key={source.source} className="py-2">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span className="font-medium">{EVIDENCE_SOURCE_LABEL[source.source] || source.source}</span>
              <span className={source.status === 'HIT' ? 'text-emerald-600' : source.status === 'SOURCE_MISSING' || source.status === 'NO_HIT_OR_ERROR' ? 'text-amber-600' : 'text-[var(--color-muted-foreground)]'}>{EVIDENCE_STATUS_LABEL[source.status] || source.status} · {source.resultChars} 字</span>
            </summary>
            <div className="mt-2 break-all leading-4 text-[var(--color-muted-foreground)]">
              <div>调用：{source.attempted ? '是' : '否'}</div>
              <div>目标：{source.target || '无'}</div>
              {source.excerpt && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--color-muted)]/55 p-2 font-sans">{source.excerpt}</pre>}
            </div>
          </details>
        ))}
      </div>
      <div className="mt-2 text-[9px] text-[var(--color-muted-foreground)]">查询：{trace.query}</div>
    </details>
  )
}

export function formatPlanningDays(value: number) {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 1 })
}

export function describePlanningAssessmentFailure(errorMessage?: string | null) {
  const message = errorMessage?.trim() || ''
  if (!message) {
    return {
      reason: '评估结果没有形成可读取的标准规划。',
      recovery: '请重新评估；系统会重新读取初始化规格并校验完整结果。',
    }
  }
  if (message.includes('scope 不能为空') || message.includes('范围说明（scope）')) {
    const exhausted = message.includes('自动纠正')
    return {
      reason: exhausted
        ? message
        : '模型生成的领域功能缺少范围说明，或范围说明超过 1000 字。',
      recovery: exhausted
        ? '当前严格准则未被放宽。可以重新评估，系统会重新生成完整规划。'
        : '这是旧版运行结果。重新评估后，系统会根据校验原因自动纠正，最多尝试 3 次。',
    }
  }
  return {
    reason: message,
    recovery: '可以重新评估；若模型输出不符合准则，系统会自动纠正，最多尝试 3 次。',
  }
}

export function parsePlanningAssessmentPayload(
  value: string | null | undefined,
): PlanningAssessmentPayload | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as PlanningAssessmentPayload
    return Array.isArray(parsed.capabilities) && typeof parsed.hoursMin === 'number' ? parsed : null
  } catch {
    return null
  }
}

export function parsePlanningEvidenceTrace(value: string | null | undefined): PlanningEvidenceTrace | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as PlanningEvidenceTrace
    return Array.isArray(parsed.sources) && typeof parsed.project === 'string' ? parsed : null
  } catch {
    return null
  }
}
