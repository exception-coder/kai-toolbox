import type { DeliveryRequirement } from '@/features/delivery-center/public-api'
import type { ReqItemView } from '../types'
import { effectiveInsight } from './reqpoolPageModel'

/** 展示身份与持久化身份分开；未登记 PRD 不能用于需求写接口。 */
export interface UnifiedRequirement {
  key: string
  title: string
  project: string
  module: string
  item?: ReqItemView
  delivery?: DeliveryRequirement
  parentTitle?: string
}

export function unifyRequirements(items: ReqItemView[], deliveries: DeliveryRequirement[]): UnifiedRequirement[] {
  const bySession = new Map(deliveries.map(delivery => [delivery.id, delivery]))
  const linked = new Set(items.flatMap(item => item.prdSessionId ? [item.prdSessionId] : []))
  const prioritized = [...items].sort((a, b) => (effectiveInsight(a)?.rank ?? 999) - (effectiveInsight(b)?.rank ?? 999)
    || (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  const registered = prioritized.map(item => {
    const delivery = item.prdSessionId ? bySession.get(item.prdSessionId) : undefined
    return toEntry(`req:${item.id}`, item.title, item, delivery, bySession)
  })
  const unregistered = deliveries.filter(delivery => !linked.has(delivery.id))
    .map(delivery => toEntry(`prd:${delivery.id}`, delivery.title, undefined, delivery, bySession))
  return [...registered, ...unregistered]
}

function toEntry(key: string, title: string, item: ReqItemView | undefined,
  delivery: DeliveryRequirement | undefined, bySession: Map<string, DeliveryRequirement>): UnifiedRequirement {
  return {
    key, title, item, delivery,
    project: item?.project?.trim() || delivery?.project?.trim() || '未归属项目',
    module: item?.module?.trim() || delivery?.module?.trim() || '未归属模块',
    parentTitle: delivery?.parentId ? bySession.get(delivery.parentId)?.title ?? '关联父需求' : undefined,
  }
}

export function filterUnifiedRequirements(entries: UnifiedRequirement[], project: string, query: string, status: string) {
  const keyword = query.trim().toLocaleLowerCase('zh-CN')
  return entries.filter(entry => (!project || entry.project === project)
    && (!status || (status === 'UNREGISTERED' ? !entry.item : entry.item?.status === status))
    && (!keyword || [entry.title, entry.project, entry.module, entry.item?.description, entry.item?.assignee, entry.parentTitle]
      .some(value => value?.toLocaleLowerCase('zh-CN').includes(keyword))))
}

export function groupUnifiedRequirements(entries: UnifiedRequirement[]) {
  const groups = new Map<string, { project: string; module: string; entries: UnifiedRequirement[] }>()
  for (const entry of entries) {
    const key = JSON.stringify([entry.project, entry.module])
    const group = groups.get(key) ?? { project: entry.project, module: entry.module, entries: [] }
    group.entries.push(entry)
    groups.set(key, group)
  }
  return [...groups.entries()]
}
