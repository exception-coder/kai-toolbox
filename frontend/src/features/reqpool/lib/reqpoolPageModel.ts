import type { DeliveryOverview, DeliveryRequirement } from '@/features/delivery-center/public-api'
import type { PrdSessionView } from '@/features/prd-clarify/public-api'
import type { ReqItemView, ReqStatus } from '../types'

export type ReqpoolDecision = 'NOW' | 'CLARIFY' | 'PLAN' | 'PARK'
export type ReqpoolDensity = 'comfortable' | 'compact'

export interface ReqpoolDisplayField {
  id: string
  label: string
  description: string
  enabled: boolean
  ai?: boolean
}

export interface ReqpoolAiInsight {
  priority?: 'STRATEGIC' | 'HIGH' | 'MEDIUM' | 'LOW'
  recommendation?: string
  reason?: string
  impacts?: string[]
  roi?: 'HIGH' | 'MEDIUM' | 'LOW'
  estimatedHours?: number
  rank?: number
}

const DEFAULT_FIELDS: ReqpoolDisplayField[] = [
  { id: 'decision', label: '统一判定', description: 'AI 按统一规则给出的投入建议', enabled: true, ai: true },
  { id: 'requirement', label: '需求事实', description: '标题、系统模块、URL 定位与事实质量', enabled: true },
  { id: 'value', label: '业务价值', description: '目标、影响与预期收益', enabled: true, ai: true },
  { id: 'owner', label: '责任与时间', description: '唯一负责人和承诺时间', enabled: true },
  { id: 'delivery', label: '交付证据', description: '需求规格、执行方案、代码自动回填', enabled: true, ai: true },
  { id: 'risk', label: '风险与下一步', description: '阻塞、缺口与明确动作', enabled: true, ai: true },
]

const VIEW_PREFERENCE_KEY = 'kai-reqpool-view-preference-v1'

export const STATUS_META: Record<ReqStatus, { label: string; cls: string }> = {
  DRAFT: { label: '待受理', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  CLARIFYING: { label: '澄清中', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  PRD_READY: { label: '已准入', cls: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300' },
  IN_DEV: { label: '交付中', cls: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300' },
  DONE: { label: '已交付', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  CANCELLED: { label: '已归档', cls: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300' },
}

export function buildReqpoolVibeSeed(ask: string): string {
  return [
    '你正在通过 kai-toolbox 的“AI 需求中枢”发起一次页面级 Vibe Coding 调整。',
    '',
    '【不可放宽的写入边界】',
    '- 唯一允许修改：当前工作目录 frontend/src/features/reqpool 及其子目录。',
    '- 禁止修改父目录、后端、公共组件、其他业务模块、构建配置、依赖和生成文件。',
    '- 可以只读仓库内其他文件以理解接口；任何写入前都必须确认目标仍在上述目录内。',
    '- 如果需求必须跨出该目录才能实现，停止越界修改，并在对话中说明受限原因和建议方案。',
    '',
    '【本次页面调整】',
    ask.trim(),
    '',
    '直接检查当前实现并完成改动，保留工作区里已有的无关修改。完成后执行与本模块相关的前端类型检查，并用业务语言简要说明页面发生了什么变化。除非存在会改变产品方向的歧义，否则不需要先让我确认方案。',
  ].join('\n')
}

export function loadReqpoolViewPreference(): { fields: ReqpoolDisplayField[]; density: ReqpoolDensity } {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_PREFERENCE_KEY) ?? '{}') as {
      fields?: ReqpoolDisplayField[]
      density?: ReqpoolDensity
    }
    const savedById = new Map(saved.fields?.map(field => [field.id, field]))
    return {
      fields: DEFAULT_FIELDS.map(field => ({ ...field, enabled: savedById.get(field.id)?.enabled ?? field.enabled })),
      density: saved.density === 'compact' ? 'compact' : 'comfortable',
    }
  } catch {
    return { fields: DEFAULT_FIELDS, density: 'comfortable' }
  }
}

export function saveReqpoolViewPreference(fields: ReqpoolDisplayField[], density: ReqpoolDensity): void {
  localStorage.setItem(VIEW_PREFERENCE_KEY, JSON.stringify({ fields, density }))
}

export function effectiveInsight(item: ReqItemView): ReqpoolAiInsight | null {
  if (item.aiInsightStale || !item.aiInsight) return null
  try {
    return JSON.parse(item.aiInsight) as ReqpoolAiInsight
  } catch {
    return null
  }
}

export function decisionOf(item: ReqItemView): ReqpoolDecision {
  if (item.status === 'CANCELLED') return 'PARK'
  if (item.status === 'DRAFT' || item.status === 'CLARIFYING') return 'CLARIFY'
  const insight = effectiveInsight(item)
  if (insight?.priority === 'STRATEGIC' || insight?.priority === 'HIGH' || item.status === 'IN_DEV') return 'NOW'
  return 'PLAN'
}

export function excerpt(value: string | null | undefined, max = 78): string {
  const text = value?.replace(/\s+/g, ' ').trim() ?? ''
  if (!text) return '尚未形成可验证的业务目标'
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function relativeTime(value: number): string {
  const hours = Math.max(0, Math.floor((Date.now() - value) / 3_600_000))
  if (hours < 1) return '刚刚'
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

export interface RequirementHierarchy {
  roots: ReqItemView[]
  childrenByItemId: Map<string, ReqItemView[]>
}

export function buildRequirementHierarchy(
  items: ReqItemView[],
  sessionsById: Map<string, PrdSessionView>,
  overview?: DeliveryOverview,
): RequirementHierarchy {
  const itemByPrdSessionId = new Map(items
    .filter((item): item is ReqItemView & { prdSessionId: string } => Boolean(item.prdSessionId))
    .map(item => [item.prdSessionId, item]))
  const deliveryById = new Map(overview?.requirements.map(requirement => [requirement.id, requirement]) ?? [])
  const childrenByItemId = new Map<string, ReqItemView[]>()
  const childIds = new Set<string>()

  for (const item of items) {
    if (!item.prdSessionId) continue
    const parentSessionId = sessionsById.get(item.prdSessionId)?.parentId
      ?? deliveryById.get(item.prdSessionId)?.parentId
    const parentItem = parentSessionId ? itemByPrdSessionId.get(parentSessionId) : undefined
    if (!parentItem || parentItem.id === item.id) continue
    const siblings = childrenByItemId.get(parentItem.id) ?? []
    siblings.push(item)
    childrenByItemId.set(parentItem.id, siblings)
    childIds.add(item.id)
  }

  for (const children of childrenByItemId.values()) {
    children.sort((left, right) => left.createdAt - right.createdAt)
  }
  return { roots: items.filter(item => !childIds.has(item.id)), childrenByItemId }
}

export function branchSome(
  item: ReqItemView,
  childrenByItemId: Map<string, ReqItemView[]>,
  predicate: (candidate: ReqItemView) => boolean,
): boolean {
  return predicate(item)
    || (childrenByItemId.get(item.id) ?? []).some(child => branchSome(child, childrenByItemId, predicate))
}

export function deliveryFor(item: ReqItemView, overview?: DeliveryOverview): DeliveryRequirement | undefined {
  if (!item.prdSessionId || !overview) return undefined
  return overview.requirements.find(requirement => requirement.id === item.prdSessionId)
}
