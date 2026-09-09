import type { DeliveryRequirement } from '@/features/delivery-center/public-api'
import type { PrdSessionView } from '@/features/prd-clarify/public-api'
import type { ReqItemView } from '../types'

export type RequirementLifecycle = 'DRAFT' | 'READY' | 'EXECUTING' | 'REVIEW' | 'DONE' | 'ARCHIVED'

export const REQUIREMENT_LIFECYCLES: RequirementLifecycle[] = ['DRAFT', 'READY', 'EXECUTING', 'REVIEW', 'DONE', 'ARCHIVED']

export const REQUIREMENT_LIFECYCLE_META: Record<RequirementLifecycle, { label: string; accent: string }> = {
  DRAFT: { label: '草稿', accent: 'bg-slate-400' },
  READY: { label: '已就绪', accent: 'bg-sky-500' },
  EXECUTING: { label: '执行中', accent: 'bg-violet-500' },
  REVIEW: { label: '待确认', accent: 'bg-amber-500' },
  DONE: { label: '已完成', accent: 'bg-emerald-500' },
  ARCHIVED: { label: '已归档', accent: 'bg-rose-400' },
}

/** 业务生命周期由需求状态与证据共同投影，不把规格、计划等技术产物当成业务阶段。 */
export function requirementLifecycle(item: ReqItemView, requirement?: DeliveryRequirement, session?: PrdSessionView): RequirementLifecycle {
  if (item.status === 'CANCELLED') return 'ARCHIVED'
  if (item.status === 'DONE') return 'DONE'
  const codeScore = requirement?.stages.code.score
  if (session?.progressWorkStatus === 'COMPLETED' && codeScore != null && codeScore >= 90) return 'REVIEW'
  if (session?.progressWorkStatus === 'RUNNING' || item.status === 'IN_DEV') return 'EXECUTING'
  if (item.status === 'PRD_READY' || !!session?.devDocPath) return 'READY'
  return 'DRAFT'
}
