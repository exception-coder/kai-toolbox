import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DeliveryStatusStrip, type DeliveryOverview, type DeliveryRequirement, type DeliveryStageKey } from '@/features/delivery-center/public-api'
import type { ReqItemView } from '../types'
import { filterUnifiedRequirements, unifyRequirements } from '../lib/unifiedDeliveryModel'
import { UnifiedDeliveryMap } from './UnifiedDeliveryMap'
import { UnifiedRequirementInspector } from './UnifiedRequirementInspector'
import './unified-delivery.css'

interface Props {
  items: ReqItemView[]
  overview?: DeliveryOverview
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onVisibleChange: (ids: string[]) => void
  onOpenItem: (item: ReqItemView) => void
  onStage: (requirement: DeliveryRequirement, stage: DeliveryStageKey) => void
  onRegister: () => void
  onSync: () => void
  syncing: boolean
  registrationsAvailable?: boolean
  loading?: boolean
  renderMetadata: (item: ReqItemView) => ReactNode
}

export function UnifiedDeliveryWorkspace(props: Props) {
  const [params, setParams] = useSearchParams()
  const project = params.get('project') ?? ''
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [status, setStatus] = useState('')
  const [selectedKey, setSelectedKey] = useState<string>()
  const entries = useMemo(() => unifyRequirements(props.items, props.overview?.requirements ?? []), [props.items, props.overview])
  const visible = useMemo(() => filterUnifiedRequirements(entries, project, query, status), [entries, project, query, status])
  const selected = visible.find(e => e.key === selectedKey) ?? visible[0]
  const projects = [...new Set(entries.map(e => e.project))]
  const visibleIds = useMemo(() => visible.flatMap(e => e.item ? [e.item.id] : []), [visible])
  useEffect(() => props.onVisibleChange(visibleIds), [visibleIds, props.onVisibleChange])
  const chooseProject = (value: string) => { const next = new URLSearchParams(params); value ? next.set('project', value) : next.delete('project'); setParams(next, { replace: true }); setSelectedKey(undefined) }
  const clear = () => { setQuery(''); setStatus(''); chooseProject('') }
  const findings = props.overview?.findings ?? []
  return <div className="unified-delivery">
    <section aria-label="交付概览" className="flex flex-wrap gap-x-8 gap-y-3 border-y border-border py-4 text-xs">
      <span><strong className="mr-2 text-lg tabular-nums">{entries.length}</strong>全部需求</span>
      <span><strong className="mr-2 text-lg tabular-nums">{entries.filter(e => e.delivery).length}</strong>已有交付证据</span>
      <span><strong className="mr-2 text-lg tabular-nums">{props.registrationsAvailable === false ? '—' : entries.filter(e => !e.item).length}</strong>{props.registrationsAvailable === false ? '登记状态待核实' : '尚未登记'}</span>
      <span className="text-muted-foreground">{projects.length} 个项目 · 选择需求查看下一步</span>
    </section>
    {props.overview && <details className="border-b border-border py-3">
      <summary className="cursor-pointer text-xs text-muted-foreground">交付证据汇总 · 全部项目的 {props.overview.summary.requirementCount} 份 PRD</summary>
      <div className="mt-3"><DeliveryStatusStrip summary={props.overview.summary} /></div>
    </details>}
    <main className="grid min-w-0 gap-4 pt-5 xl:grid-cols-[160px_minmax(0,1fr)_300px] 2xl:grid-cols-[190px_minmax(0,1fr)_340px]">
      <nav aria-label="项目空间" className="min-w-0 border-b border-border pb-3 xl:border-b-0 xl:border-r xl:pr-4">
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">项目空间</h2>
        <div className="flex gap-2 overflow-x-auto xl:block xl:space-y-1">{['', ...projects].map(name => <button key={name} aria-current={project === name ? 'page' : undefined}
          onClick={() => chooseProject(name)} className={`min-w-36 px-3 py-3 text-left xl:w-full xl:min-w-0 ${project === name ? 'bg-primary/8' : 'hover:bg-muted/50'}`}>
          <span className="block truncate text-xs font-medium">{name || '全部项目'}</span>
          <span className="mt-2 block text-[10px] text-muted-foreground">{name ? entries.filter(e => e.project === name).length : entries.length} 项需求</span>
        </button>)}</div>
      </nav>
      <UnifiedDeliveryMap entries={visible} total={entries.length} query={query} status={status} selectedKey={selected?.key} selectedIds={props.selectedIds} findings={findings} registrationsAvailable={props.registrationsAvailable} loading={props.loading}
        onQuery={setQuery} onStatus={setStatus} onSelect={setSelectedKey} onToggle={props.onToggle} onStage={props.onStage} onClear={clear} onRegister={props.onRegister} />
      <div className="min-w-0 space-y-4" aria-label="需求检查器">
        <UnifiedRequirementInspector entry={selected} findings={findings} onOpen={props.onOpenItem} onStage={props.onStage}
          onSync={props.onSync} syncing={props.syncing} registrationsAvailable={props.registrationsAvailable} renderMetadata={props.renderMetadata} />
      </div>
    </main>
  </div>
}
