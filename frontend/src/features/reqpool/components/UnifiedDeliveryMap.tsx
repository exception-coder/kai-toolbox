import { Boxes, Search } from 'lucide-react'
import { PrdDeliveryTrack, type DeliveryFinding, type DeliveryRequirement, type DeliveryStageKey } from '@/features/delivery-center/public-api'
import { STATUS_META } from '../lib/reqpoolPageModel'
import { groupUnifiedRequirements, type UnifiedRequirement } from '../lib/unifiedDeliveryModel'

interface Props {
  entries: UnifiedRequirement[]
  total: number
  query: string
  status: string
  selectedKey?: string
  selectedIds: Set<string>
  findings: DeliveryFinding[]
  onQuery: (value: string) => void
  onStatus: (value: string) => void
  onSelect: (key: string) => void
  onToggle: (id: string) => void
  onStage: (requirement: DeliveryRequirement, stage: DeliveryStageKey) => void
  onClear: () => void
  onRegister: () => void
  registrationsAvailable?: boolean
  loading?: boolean
}

export function UnifiedDeliveryMap(props: Props) {
  const groups = groupUnifiedRequirements(props.entries)
  return <section className="delivery-map min-w-0 border border-border" aria-label="需求交付轨道">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border bg-background px-5 py-4">
      <div><p className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground"><Boxes size={14} />Delivery map</p>
        <h2 className="mt-1 text-base font-semibold">需求交付轨道 <span className="ml-2 text-xs font-normal text-muted-foreground">{props.entries.length} 项</span></h2></div>
      <div className="flex w-full flex-wrap gap-3 sm:w-auto">
        <label className="flex min-w-0 flex-1 items-center gap-2 border-b border-border py-2"><Search size={14} />
          <input aria-label="搜索需求" value={props.query} onChange={e => props.onQuery(e.target.value)} placeholder="需求、模块、负责人" className="min-w-0 w-full bg-transparent text-xs outline-none" /></label>
        <select aria-label="筛选阶段" className="min-w-0 border-b border-border bg-background py-2 text-xs" value={props.status} onChange={e => props.onStatus(e.target.value)}>
          <option value="">全部阶段</option>{Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}<option value="UNREGISTERED">{props.registrationsAvailable === false ? '登记状态待核实' : '尚未登记'}</option>
        </select>
      </div>
    </header>
    {groups.length === 0 && props.loading ? <p role="status" className="min-h-72 px-5 py-12 text-xs text-muted-foreground">正在读取需求与交付证据…</p> : groups.length === 0 ? <div className="min-h-72 px-5 py-12">
      <h3 className="text-base font-medium">{props.total ? '当前筛选没有结果' : '从一条需求开始'}</h3>
      <p className="mt-2 text-xs text-muted-foreground">{props.total ? '清除筛选，返回完整的需求轨道。' : '快速登记需求，或从标准起草与飞书导入开始。'}</p>
      <button className="delivery-action mt-5" onClick={props.total ? props.onClear : props.onRegister}>{props.total ? '清除筛选' : '登记第一条需求'}</button>
    </div> : <div className="space-y-6 p-4 sm:p-5">{groups.map(([key, group]) => <article key={key} className="border-l border-border pl-4">
      <h3 className="mb-3 flex flex-wrap items-baseline gap-2 text-xs font-semibold">{group.module}<span className="text-[10px] font-normal text-muted-foreground">{group.project} · {group.entries.length} 项</span></h3>
      <div className="divide-y divide-border bg-background/95">{group.entries.map(entry => <div key={entry.key}>
        <div className="flex items-center gap-2 px-3 pt-3 text-[10px] text-muted-foreground">
          {entry.item && <label className="flex items-center gap-2"><input type="checkbox" aria-label={`选择 ${entry.title}`} checked={props.selectedIds.has(entry.item.id)} onChange={() => props.onToggle(entry.item!.id)} />{STATUS_META[entry.item.status]?.label ?? entry.item.status}</label>}
          {!entry.item && <span>{props.registrationsAvailable === false ? '登记状态待核实' : '尚未登记'} · PRD 会话</span>}
          {entry.parentTitle && <span className="min-w-0 truncate">子需求 · {entry.parentTitle}</span>}
        </div>
        {entry.delivery ? <PrdDeliveryTrack requirement={{ ...entry.delivery, title: entry.title }} findings={props.findings.filter(f => f.requirementId === entry.delivery!.id)} selected={props.selectedKey === entry.key}
          onSelect={() => props.onSelect(entry.key)} onStageSelect={stage => props.onStage(entry.delivery!, stage)} />
          : <button className={`w-full px-3 py-4 text-left ${props.selectedKey === entry.key ? 'bg-primary/8' : 'hover:bg-muted/50'}`} onClick={() => props.onSelect(entry.key)}>
            <p className="text-xs font-medium">{entry.title}</p><p className="mt-2 text-[11px] text-muted-foreground">{entry.item?.prdSessionId ? '交付证据尚未加载，仍可管理需求' : '需求已登记 · 待澄清与形成交付证据'}</p>
          </button>}
      </div>)}</div>
    </article>)}</div>}
  </section>
}
