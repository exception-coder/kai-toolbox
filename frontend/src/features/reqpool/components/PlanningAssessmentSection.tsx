import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { getItem, retryPlanningAssessment } from '../api'
import type { PlanningAssessmentPayload, PlanningConfidence, PlanningEvidenceSourceTrace, PlanningEvidenceTrace, ReqItemView } from '../types'

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
  SOURCE: '源码事实',
  CROSS_PROJECT_TOPOLOGY: '跨项目拓扑',
}

const EVIDENCE_STATUS_LABEL: Record<string, string> = {
  HIT: '已命中',
  SOURCE_MISSING: '数据源缺失',
  NO_HIT: '已查询，未命中',
  EXECUTION_ERROR: '调用异常',
  NO_HIT_OR_ERROR: '未命中或调用异常',
  NOT_APPLICABLE: '不适用',
  NOT_INVOKED: '未调用',
}

/** 在需求详情中展示可追溯的初始化规格规划评估。 */
export function PlanningAssessmentSection({ item }: { item: ReqItemView }) {
  const queryClient = useQueryClient()
  const shouldRecoverTrace = !!item.planningAssessment && !item.planningAssessment.evidenceTraceJson
  const detail = useQuery({
    queryKey: ['reqpool', 'item-detail', item.id],
    queryFn: () => getItem(item.id),
    enabled: shouldRecoverTrace,
    staleTime: 0,
  })
  const recoveredAssessment = detail.data?.planningAssessment
  const assessment = recoveredAssessment?.evidenceTraceJson ? recoveredAssessment : item.planningAssessment
  const payload = parsePlanningAssessmentPayload(assessment?.payloadJson)
  const evidenceTrace = parsePlanningEvidenceTrace(assessment?.evidenceTraceJson)
  const retry = useMutation({
    mutationFn: () => retryPlanningAssessment(item.id),
    onSuccess: nextAssessment => {
      queryClient.setQueryData<ReqItemView>(['reqpool', 'item-detail', item.id], current => (
        current ? { ...current, planningAssessment: nextAssessment } : current
      ))
      void queryClient.invalidateQueries({ queryKey: ['reqpool'] })
    },
  })
  const legacyCriteria = assessment?.status === 'COMPLETED'
    && assessment.criteriaVersion !== 'initial-spec-planning-v4'
  const insightOutdated = assessment?.status === 'COMPLETED'
    && !!item.aiInsightId
    && assessment.sourceInsightId !== item.aiInsightId

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
          {assessment.sourceInsightId ? '价值判定已更新，正在同步功能与规划工时' : '正在生成领域功能与规划工时'}
        </div>
        <p className="mt-2 text-[11px] leading-5 text-[var(--color-muted-foreground)]">
          后台任务支持关闭面板、刷新页面和应用重启后继续。准则 {assessment.criteriaVersion}。
        </p>
        <PlanningEvidenceTracePanel trace={evidenceTrace} recovering={detail.isFetching} />
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
        <PlanningEvidenceTracePanel trace={evidenceTrace} recovering={detail.isFetching} />
      </section>
    )
  }

  return (
    <section className="border-y border-[var(--color-border)] py-4">
      <div className={payload.firstTestRelease ? 'grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-4' : 'flex items-end justify-between gap-4'}>
        {payload.firstTestRelease && (
          <div className="min-w-0 border-r border-[var(--color-border)] pr-4">
            <div className="text-[10px] font-medium text-[var(--color-muted-foreground)]">首版上测试环境</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {formatPlanningDays(payload.firstTestRelease.workingDaysMin)}–{formatPlanningDays(payload.firstTestRelease.workingDaysMax)}
              <span className="ml-1 text-[10px] font-normal">工作日</span>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-[var(--color-foreground)]/80">{payload.firstTestRelease.scope}</p>
            <div className="mt-1 text-[9px] text-[var(--color-muted-foreground)]">单主开发线 · {payload.firstTestRelease.hoursMin}–{payload.firstTestRelease.hoursMax} 有效小时</div>
          </div>
        )}
        <div className={payload.firstTestRelease ? 'min-w-0' : undefined}>
          <div className="text-[10px] text-[var(--color-muted-foreground)]">完整范围投入</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {formatPlanningDays(payload.personDaysMin)}–{formatPlanningDays(payload.personDaysMax)}
            <span className="ml-1 text-[10px] font-normal">人日</span>
          </div>
          <div className="mt-1 text-[9px] leading-4 text-[var(--color-muted-foreground)]">{payload.hoursMin}–{payload.hoursMax} 有效小时<br />评估信心 {CONFIDENCE_LABEL[payload.confidence]}</div>
        </div>
      </div>
      {payload.firstTestRelease && (
        <details className="mt-3 border-t border-[var(--color-border)] pt-2 text-[10px] text-[var(--color-muted-foreground)]">
          <summary className="cursor-pointer list-none py-1 font-medium hover:text-[var(--color-foreground)]">首版验收与后续迭代边界</summary>
          <div className="mt-1 leading-4">
            <div>可验证：{payload.firstTestRelease.acceptanceChecks.join('；')}</div>
            {payload.firstTestRelease.deferredScope.length > 0 && <div className="mt-1">后续迭代：{payload.firstTestRelease.deferredScope.join('；')}</div>}
          </div>
        </details>
      )}
      {(legacyCriteria || insightOutdated) && <div className="mt-3 flex items-start justify-between gap-3 border-l-2 border-amber-300 pl-3 text-[10px] leading-5"><div><div className="font-semibold">{insightOutdated ? '价值判定已更新，规划工时尚未同步' : '这是旧版技术工作包口径'}</div><div className="text-[var(--color-muted-foreground)]">{insightOutdated ? '当前展示的是上一版规划。同步后会复用最新价值结论，并重新计算正式工时。' : '旧版可能重复累计公共探索、联调和回归成本，建议按新版业务功能口径同步评估。'}</div></div><button type="button" disabled={retry.isPending} onClick={() => retry.mutate()} className="shrink-0 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 font-medium hover:bg-[var(--color-muted)] disabled:opacity-50">{retry.isPending ? '提交中…' : '同步评估'}</button></div>}
      <p className="mt-3 text-[11px] leading-5 text-[var(--color-foreground)]/80">{payload.summary}</p>
      <PlanningEvidenceTracePanel trace={evidenceTrace} recovering={detail.isFetching} />
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
              <p className="mt-3 text-[10px] leading-4 text-[var(--color-muted-foreground)]">
                <span className="mr-1 font-medium text-amber-700 dark:text-amber-300">需确认</span>
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
        {assessment.sourceInsightId && <span>复用判定 {assessment.sourceInsightId.slice(0, 8)}</span>}
        {assessment.completedAt && <span>{new Date(assessment.completedAt).toLocaleString()}</span>}
      </div>
    </section>
  )
}

function PlanningEvidenceTracePanel({ trace, recovering = false }: { trace: PlanningEvidenceTrace | null; recovering?: boolean }) {
  if (!trace) {
    if (recovering) {
      return <div className="mt-3 flex items-center gap-2 border-l-2 border-violet-300 pl-3 text-[10px] leading-4 text-[var(--color-muted-foreground)]"><Loader2 className="h-3 w-3 animate-spin" />正在恢复本次后台任务的证据轨迹…</div>
    }
    return <div className="mt-3 border-l-2 border-amber-300 pl-3 text-[10px] leading-4 text-[var(--color-muted-foreground)]">该历史评估未记录证据调用轨迹，无法反推是知识缺失还是未成功查询。请从规格探索重新确认以生成完整轨迹。</div>
  }
  const roleSummaries = summarizePlanningEvidenceRoles(trace)
  return (
    <div className="mt-4 border-y border-[var(--color-border)] py-3 text-[10px]">
      <div className="space-y-2">
        {roleSummaries.map(summary => (
          <div key={`${summary.role}:${summary.project}`} className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="font-medium">{summary.roleLabel} · {summary.project}</div>
              <div className="mt-0.5 leading-4 text-[var(--color-muted-foreground)]">{summary.description}</div>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 text-[var(--color-foreground)]">
              {summary.hitCount === 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
              {summary.hitCount > 0 ? `${summary.hitCount} 类命中` : '存在缺口'}
            </span>
          </div>
        ))}
      </div>
      <details className="mt-3 border-t border-[var(--color-border)] pt-3">
      <summary className="cursor-pointer list-none font-semibold">证据路由与查询轨迹</summary>
      <div className="mt-2 text-[var(--color-muted-foreground)]">
        项目 {trace.primaryProject || trace.project || '未路由'}
        {trace.module ? ` · 模块 ${trace.module}` : ''}
        {trace.round ? ` · 第 ${trace.round}/${trace.maxRounds || trace.round} 轮` : ''}
        {trace.complete === false ? ' · 仍有证据缺口' : ''}
        {trace.capturedAt ? ` · ${new Date(trace.capturedAt).toLocaleString()}` : ''}
      </div>
      <div className="mt-3 divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
        {trace.sources.map(source => (
          <details key={source.entryId || `${source.sourceProject || 'primary'}:${source.source}:${source.target}`} className="py-2">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span className="font-medium">{source.sourceProject ? `${source.sourceProject} · ` : ''}{EVIDENCE_SOURCE_LABEL[source.source] || source.source}</span>
              <span className={source.status === 'SOURCE_MISSING' || source.status === 'NO_HIT' || source.status === 'NO_HIT_OR_ERROR' || source.status === 'EXECUTION_ERROR' ? 'text-amber-600' : 'text-[var(--color-muted-foreground)]'}>{EVIDENCE_STATUS_LABEL[source.status] || source.status} · {source.resultChars} 字</span>
            </summary>
            <div className="mt-2 break-all leading-4 text-[var(--color-muted-foreground)]">
              <div>调用：{source.attempted ? '是' : '否'}</div>
              {source.relation && <div>关系：{source.relation} · {source.projectRole || '未标注角色'}</div>}
              <div>目标：{source.target || '无'}</div>
              {source.queryReason && <div>查询原因：{source.queryReason}</div>}
              {source.errorSummary && <div className="text-amber-700 dark:text-amber-300">异常：{source.errorSummary}</div>}
              {source.excerpt && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--color-muted)]/55 p-2 font-sans">{source.excerpt}</pre>}
            </div>
          </details>
        ))}
      </div>
      {(trace.query || trace.purpose) && <div className="mt-2 text-[9px] text-[var(--color-muted-foreground)]">用途：{trace.query || trace.purpose}</div>}
      </details>
    </div>
  )
}

export interface PlanningEvidenceRoleSummary {
  project: string
  role: string
  roleLabel: string
  hitCount: number
  description: string
}

/** 把逐调用轨迹压缩成管理者可直接理解的项目角色摘要。 */
export function summarizePlanningEvidenceRoles(trace: PlanningEvidenceTrace): PlanningEvidenceRoleSummary[] {
  const grouped = new Map<string, { project: string; role: string; sources: PlanningEvidenceSourceTrace[] }>()
  for (const source of trace.sources) {
    const project = source.sourceProject || trace.primaryProject || trace.project || '未路由'
    const role = source.projectRole || (project === (trace.primaryProject || trace.project) ? 'CURRENT_IMPLEMENTATION' : 'RELATED_PROJECT')
    const key = `${role}:${project}`
    const current = grouped.get(key) || { project, role, sources: [] }
    current.sources.push(source)
    grouped.set(key, current)
  }
  return [...grouped.values()].map(group => {
    const hits = group.sources.filter(source => source.status === 'HIT')
    const gaps = group.sources.filter(source => ['SOURCE_MISSING', 'NO_HIT', 'NO_HIT_OR_ERROR', 'EXECUTION_ERROR'].includes(source.status))
    const hitLabels = hits.map(source => EVIDENCE_SOURCE_LABEL[source.source] || source.source)
    const gapLabels = gaps.map(source => `${EVIDENCE_SOURCE_LABEL[source.source] || source.source}${source.status === 'SOURCE_MISSING' ? '数据源缺失' : '待补证'}`)
    const parts = [
      hitLabels.length > 0 ? `已命中 ${hitLabels.join('、')}` : '',
      gapLabels.length > 0 ? `${gapLabels.join('、')}` : '',
    ].filter(Boolean)
    return {
      project: group.project,
      role: group.role,
      roleLabel: planningEvidenceRoleLabel(group.role),
      hitCount: hits.length,
      description: parts.join('；') || '本次未安排证据查询',
    }
  })
}

function planningEvidenceRoleLabel(role: string) {
  if (role === 'CURRENT_IMPLEMENTATION' || role === 'PRIMARY') return '当前实现'
  if (role === 'LEGACY_SOURCE') return '遗留来源'
  if (role === 'DEPENDENCY') return '依赖项目'
  return '关联项目'
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
    const project = parsed.primaryProject || parsed.project
    return Array.isArray(parsed.sources) && typeof project === 'string' ? parsed : null
  } catch {
    return null
  }
}
