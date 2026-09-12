import type { ReactNode } from 'react'
import { AiInspector, type DeliveryFinding, type DeliveryStageKey, type DeliveryRequirement } from '@/features/delivery-center/public-api'
import type { ReqItemView } from '../types'
import type { UnifiedRequirement } from '../lib/unifiedDeliveryModel'

interface Props {
  entry?: UnifiedRequirement
  findings: DeliveryFinding[]
  onOpen: (item: ReqItemView) => void
  onStage: (requirement: DeliveryRequirement, stage: DeliveryStageKey) => void
  onSync: () => void
  syncing: boolean
  registrationsAvailable?: boolean
  renderMetadata: (item: ReqItemView) => ReactNode
}

export function UnifiedRequirementInspector(props: Props) {
  const entry = props.entry
  if (!entry) return <p className="px-1 py-5 text-xs text-muted-foreground">选择一条需求，查看负责人、执行动作与交付证据。</p>
  const management = entry.item ? <>
    <div className="grid grid-cols-2 gap-4">{props.renderMetadata(entry.item)}</div>
    <button className="delivery-action mt-4" onClick={() => props.onOpen(entry.item!)}>管理需求与执行</button>
  </> : <>
    <p className="text-xs leading-6 text-muted-foreground">{props.registrationsAvailable === false ? '需求数据暂不可用，登记状态尚无法核实。请先重试需求列表。' : '此 PRD 尚未登记到需求池。可查看阶段证据，或同步登记后安排负责人和期限。'}</p>
    <button className="delivery-action mt-3" disabled={props.syncing || props.registrationsAvailable === false} onClick={props.onSync}>{props.syncing ? '同步中…' : '同步登记需求'}</button>
  </>
  if (entry.delivery) return <AiInspector requirement={{ ...entry.delivery, title: entry.title }} findings={props.findings.filter(f => f.requirementId === entry.delivery!.id)}
    management={management} onStageSelect={stage => props.onStage(entry.delivery!, stage)} />
  return <aside className="border border-border bg-background p-5">
    <p className="text-[10px] uppercase tracking-widest text-primary">Requirement / 管理</p>
    <h2 className="mb-4 mt-2 break-words text-sm font-semibold">{entry.title}</h2>
    {management}
    <section className="mt-5 border-t border-border pt-4"><h3 className="text-xs font-medium">交付证据待形成</h3>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">进入需求管理，完成澄清后继续需求规格、执行方案与开发流程。</p></section>
  </aside>
}
