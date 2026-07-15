export type ReqPriority = 'HIGH' | 'MEDIUM' | 'LOW'
export type ReqStatus = 'DRAFT' | 'CLARIFYING' | 'PRD_READY' | 'IN_DEV' | 'DONE' | 'CANCELLED'

export interface ReqItemView {
  id: string
  title: string
  description: string | null
  project: string | null
  module: string | null
  priority: ReqPriority
  status: ReqStatus
  assignee: string | null
  deadline: string | null   // yyyy-MM-dd
  prdSessionId: string | null
  tags: string | null
  /** Claude AI 价值洞察分析 JSON（含 priority/stars/recommendation/impacts/roi/estimatedHours） */
  aiInsight: string | null
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

export interface UpdateReqRequest extends Partial<CreateReqRequest> {
  status?: ReqStatus
}

export const STATUS_META: Record<ReqStatus, { label: string; color: string; bg: string }> = {
  DRAFT:      { label: '草稿',    color: 'text-slate-500',  bg: 'bg-slate-500/10 border-slate-500/20' },
  CLARIFYING: { label: '澄清中',  color: 'text-yellow-500', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  PRD_READY:  { label: 'PRD就绪', color: 'text-blue-500',   bg: 'bg-blue-500/10 border-blue-500/20' },
  IN_DEV:     { label: '开发中',  color: 'text-purple-500', bg: 'bg-purple-500/10 border-purple-500/20' },
  DONE:       { label: '已完成',  color: 'text-green-500',  bg: 'bg-green-500/10 border-green-500/20' },
  CANCELLED:  { label: '已取消',  color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
}

export const PRIORITY_META: Record<ReqPriority, { label: string; color: string; dot: string }> = {
  HIGH:   { label: '高', color: 'text-red-500',   dot: 'bg-red-500' },
  MEDIUM: { label: '中', color: 'text-amber-500', dot: 'bg-amber-500' },
  LOW:    { label: '低', color: 'text-slate-400', dot: 'bg-slate-400' },
}
