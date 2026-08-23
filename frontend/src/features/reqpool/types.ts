export type ReqPriority = 'HIGH' | 'MEDIUM' | 'LOW'
export type ReqStatus = 'DRAFT' | 'CLARIFYING' | 'PRD_READY' | 'IN_DEV' | 'DONE' | 'CANCELLED'
export type RequirementType = 'BUG_FIX' | 'MODULE_ADJUST' | 'NEW_MODULE' | 'UNKNOWN'
export type RequirementTypeSource = 'EXPLICIT' | 'AI' | 'PRD_SESSION' | 'UNKNOWN'
export type PlanningAssessmentStatus = 'RUNNING' | 'COMPLETED' | 'FAILED'
export type PlanningConfidence = 'HIGH' | 'MEDIUM' | 'LOW'

export interface PlanningWorkPackage {
  type: 'DISCOVERY_DESIGN' | 'BACKEND' | 'FRONTEND' | 'DATA' | 'INTEGRATION' | 'TEST_VERIFICATION'
  hoursMin: number
  hoursMax: number
  reason: string
}

export interface PlanningCapability {
  id: string
  domain: string
  name: string
  businessOutcome: string
  scope: string
  specRefs: string[]
  evidenceRefs: string[]
  dependencies: string[]
  risks: string[]
  confidence: PlanningConfidence
  bufferRate: number
  baseHoursMin: number
  baseHoursMax: number
  hoursMin: number
  hoursMax: number
  workPackages: PlanningWorkPackage[]
}

export interface PlanningAssessmentPayload {
  criteriaVersion: string
  effectiveHoursPerPersonDay: number
  summary: string
  confidence: PlanningConfidence
  assumptions: string[]
  hoursMin: number
  hoursMax: number
  personDaysMin: number
  personDaysMax: number
  capabilities: PlanningCapability[]
}

export interface PlanningAssessmentView {
  id: string
  status: PlanningAssessmentStatus
  criteriaVersion: string
  promptVersion: string
  inputHash: string
  evidenceTraceJson: string | null
  payloadJson: string | null
  engine: string
  model: string | null
  errorMessage: string | null
  startedAt: number
  completedAt: number | null
}

export type PlanningEvidenceStatus = 'HIT' | 'SOURCE_MISSING' | 'NO_HIT_OR_ERROR' | 'NOT_APPLICABLE' | 'NOT_INVOKED'

export interface PlanningEvidenceSourceTrace {
  source: 'DOMAIN_KNOWLEDGE' | 'GRAPHIFY' | 'DDL' | 'ROUTE_MAP'
  attempted: boolean
  status: PlanningEvidenceStatus
  target: string
  resultChars: number
  excerpt: string
}

export interface PlanningEvidenceTrace {
  version: string
  project: string
  module: string
  query: string
  capturedAt: number
  sources: PlanningEvidenceSourceTrace[]
}

export interface ReqItemView {
  id: string
  title: string
  description: string | null
  project: string | null
  module: string | null
  priority: ReqPriority
  status: ReqStatus
  assignee: string | null
  assigneeUserId: number | null
  deadline: string | null   // yyyy-MM-dd
  prdSessionId: string | null
  tags: string | null
  reqType: RequirementType
  reqTypeSource: RequirementTypeSource
  reqTypeConfidence: number
  /** Claude AI 价值洞察分析 JSON（含 priority/stars/recommendation/impacts/roi/estimatedHours） */
  aiInsight: string | null
  aiInsightType: 'ITEM' | 'PORTFOLIO' | null
  aiInsightPromptVersion: string | null
  aiInsightGeneratedAt: number | null
  aiInsightStale: boolean
  aiInsightStaleReason: 'SOURCE_CHANGED' | 'PORTFOLIO_CHANGED' | 'LEGACY_UNVERIFIED' | null
  planningAssessment: PlanningAssessmentView | null
  createdAt: number
  updatedAt: number
}

export interface CreateReqRequest {
  title: string
  description?: string
  project?: string
  module?: string
  priority?: ReqPriority
  assignee?: string
  deadline?: string
  tags?: string
}

export interface AssignableUser {
  userId: number
  username: string
  realName: string | null
}

export interface UpdateReqRequest extends Partial<CreateReqRequest> {
  status?: ReqStatus
}

export const STATUS_META: Record<ReqStatus, { label: string; color: string; bg: string }> = {
  DRAFT:      { label: '草稿',    color: 'text-slate-500',  bg: 'bg-slate-500/10 border-slate-500/20' },
  CLARIFYING: { label: '澄清中',  color: 'text-yellow-500', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  PRD_READY:  { label: '规格就绪', color: 'text-blue-500',   bg: 'bg-blue-500/10 border-blue-500/20' },
  IN_DEV:     { label: '开发中',  color: 'text-purple-500', bg: 'bg-purple-500/10 border-purple-500/20' },
  DONE:       { label: '已完成',  color: 'text-green-500',  bg: 'bg-green-500/10 border-green-500/20' },
  CANCELLED:  { label: '已取消',  color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
}

export const PRIORITY_META: Record<ReqPriority, { label: string; color: string; dot: string }> = {
  HIGH:   { label: '高', color: 'text-red-500',   dot: 'bg-red-500' },
  MEDIUM: { label: '中', color: 'text-amber-500', dot: 'bg-amber-500' },
  LOW:    { label: '低', color: 'text-slate-400', dot: 'bg-slate-400' },
}
