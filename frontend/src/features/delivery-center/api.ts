import { http } from '@/lib/api'
import type { DeliveryOverview, DeliveryRequirement, StageView } from './types'
import type { DeliveryVerificationRun } from './types'
import type { DocumentProfile, PrdBusinessFields } from '@/features/prd-clarify/public-api'

export interface DeliveryFilters {
  project?: string
  module?: string
  query?: string
}

export interface TitleSuggestion {
  shortTitle: string
  title: string
}

export interface CreatePrdDraftRequest {
  title: string
  rawInput: string
  project: string
  module: string
  documentProfile: DocumentProfile
  businessFields?: PrdBusinessFields
}

export interface FeishuRequirementRecord {
  recordId: string
  title: string
  fields: Record<string, string>
}

export interface FeishuRequirementPullResult {
  sourceUrl: string
  appToken: string
  tableId: string
  viewId: string
  count: number
  pageCount: number
  syncMode: 'COOKIE_DIRECT' | 'BROWSER_FALLBACK'
  records: FeishuRequirementRecord[]
}

/** 根据系统、模块、需求描述和图片生成规范标题。 */
export function suggestPrdTitle(project: string, module: string, rawInput: string) {
  return http<TitleSuggestion>('/prd-clarify/title-suggestion', {
    method: 'POST',
    body: JSON.stringify({ project, module, rawInput }),
  })
}

/** 创建正式 PRD 澄清会话，交由 PRD 模块继续处理生命周期。 */
export function createPrdDraft(request: CreatePrdDraftRequest) {
  return http<{ id: string }>('/prd-clarify/sessions', {
    method: 'POST',
    body: JSON.stringify({
      ...request,
      role: 'BUSINESS',
      clarifyMode: 'batch',
    }),
  })
}

export async function getDeliveryOverview(filters: DeliveryFilters = {}) {
  const params = new URLSearchParams()
  if (filters.project) params.set('project', filters.project)
  if (filters.module) params.set('module', filters.module)
  if (filters.query) params.set('q', filters.query)
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  const overview = await http<DeliveryOverview>(`/prd-clarify/delivery-overview${suffix}`)
  return normalizeDeliveryOverview(overview)
}

/** 只提交服务端登记的命令 ID，执行参数由后端白名单决定。 */
export function startDeliveryVerification(sessionId: string, commandId: string) {
  return http<DeliveryVerificationRun>(
    `/prd-clarify/delivery-overview/${encodeURIComponent(sessionId)}/verification-runs`,
    {
      method: 'POST',
      body: JSON.stringify({ commandId }),
    },
  )
}

/**
 * 兼容尚未重启/升级的旧后端：旧响应只有 PRD、TDD、Code、Test、Runtime 五阶段。
 * 在 API 边界补齐新增的草稿/澄清阶段，避免组件直接读取 undefined.status 导致整个模块崩溃。
 */
function normalizeDeliveryOverview(overview: DeliveryOverview): DeliveryOverview {
  return {
    ...overview,
    requirements: overview.requirements.map(normalizeRequirementStages),
  }
}

function normalizeRequirementStages(requirement: DeliveryRequirement): DeliveryRequirement {
  const stages = requirement.stages
  const prd = stages.prd ?? missingStage('PRD 状态不可用')
  const tdd = stages.tdd ?? missingStage('TDD 状态不可用')
  const prdFinished = prd.status === 'COMPLETE'

  return {
    ...requirement,
    documentProfile: requirement.documentProfile ?? 'CLASSIC',
    overallProgress: requirement.overallProgress ?? 0,
    overallProgressVariants: requirement.overallProgressVariants ?? {
      includingTests: requirement.overallProgress ?? 0,
      excludingTests: requirement.overallProgress ?? 0,
    },
    evidenceMode: requirement.evidenceMode ?? 'LEGACY_UNVERIFIED',
    verifiedClaimCount: requirement.verifiedClaimCount ?? 0,
    invalidEvidenceCount: requirement.invalidEvidenceCount ?? 0,
    verification: requirement.verification ?? null,
    availableVerificationCommands: requirement.availableVerificationCommands ?? [],
    stages: {
      ...stages,
      prdDraft: stages.prdDraft ?? {
        status: 'COMPLETE',
        score: 100,
        updatedAt: requirement.updatedAt,
        note: '需求草稿已保存（由旧版响应推断）',
      },
      prdClarify: stages.prdClarify ?? inferLegacyPrdClarify(requirement),
      prd,
      tddClarify: stages.tddClarify ?? (
        !prdFinished
          ? unavailableStage('请先完成 PRD 与业务澄清')
          : tdd.status === 'COMPLETE' || tdd.status === 'STALE'
            ? {
                status: 'PARTIAL',
                score: 50,
                updatedAt: tdd.updatedAt,
                note: '旧版响应未提供 TDD 技术澄清记录',
              }
            : missingStage('待核对编码前必须明确的关键技术细节')
      ),
      tdd,
      code: stages.code ?? unavailableStage('代码评估状态不可用'),
      test: stages.test ?? unavailableStage('待接入测试报告'),
      runtime: stages.runtime ?? unavailableStage('待接入部署与运行数据'),
    },
  }
}

function inferLegacyPrdClarify(requirement: DeliveryRequirement): StageView {
  if (requirement.status === 'DRAFT') {
    return missingStage('尚未开始 PRD 业务澄清')
  }
  if (requirement.status === 'CLARIFYING') {
    return {
      status: 'PARTIAL',
      score: 0,
      updatedAt: requirement.updatedAt,
      note: '正在核对 PRD 必须明确的业务问题',
    }
  }
  if (requirement.status === 'ERROR') {
    return {
      status: 'ERROR',
      score: 0,
      updatedAt: requirement.updatedAt,
      note: 'PRD 澄清执行失败',
    }
  }
  return {
    status: 'COMPLETE',
    score: 100,
    updatedAt: requirement.updatedAt,
    note: 'PRD 业务目标、范围和规则已确认',
  }
}

function missingStage(note: string): StageView {
  return { status: 'MISSING', score: 0, updatedAt: null, note }
}

function unavailableStage(note: string): StageView {
  return { status: 'UNAVAILABLE', score: null, updatedAt: null, note }
}

/** Cookie 只随本次请求发送给本地后端，不在前端或后端持久化。 */
export function pullFeishuRequirements(url: string, cookie: string, recordsUrl: string) {
  return http<FeishuRequirementPullResult>('/browser-request/feishu/requirements/pull', {
    method: 'POST',
    body: JSON.stringify({ url, cookie, recordsUrl }),
  })
}
