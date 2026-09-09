import { Button } from '@/components/ui/button'
import type { ProgressOpenSpecDiscovery } from '@/features/prd-clarify/public-api'

interface Props {
  discovery?: ProgressOpenSpecDiscovery
  loading: boolean
  error: boolean
  selected: string
  disabled: boolean
  onSelect: (id: string) => void
  onRefresh: () => void
}

export function AnalysisOpenSpecSelector(props: Props) {
  const { discovery, selected } = props
  const invalid = !!selected && !discovery?.changeIds.includes(selected)
  return <section className="mt-5 border-t border-[var(--color-border)] pt-4" aria-label="项目 OpenSpec 计划">
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">关联项目计划</span>
      <Button size="sm" variant="ghost" disabled={props.loading || props.disabled} onClick={props.onRefresh}>刷新</Button>
    </div>
    {props.loading ? <p role="status" className="mt-2 text-xs text-[var(--color-muted-foreground)]">正在读取项目 OpenSpec…</p>
      : props.error || discovery?.state === 'ERROR'
        ? <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{discovery?.state === 'ERROR' ? discovery.message : '读取计划失败，请刷新重试。'}</p>
        : <>
          {!!discovery?.changeIds.length && <label className="mt-2 block text-xs text-[var(--color-muted-foreground)]">OpenSpec 活动变更
            <select aria-label="OpenSpec 活动变更" value={selected} disabled={props.disabled} onChange={event => props.onSelect(event.target.value)} className="mt-2 h-10 w-full min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm text-[var(--color-foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-ring)]">
              <option value="">请选择本次需求对应的变更</option>
              {invalid && <option value={selected} disabled>{selected}（已不可用）</option>}
              {discovery.changeIds.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>}
          <p className="mt-2 text-xs leading-5 text-[var(--color-muted-foreground)]">{invalid ? '原关联变更已不可用，请重新选择；若项目已无计划，可清除关联后仅核查源码。' : selected ? `使用 openspec/changes/${selected}/tasks.md 作为任务计划。` : discovery?.message}</p>
          {invalid && !discovery?.changeIds.length && <Button size="sm" variant="outline" disabled={props.disabled} onClick={() => props.onSelect('')}>清除失效关联</Button>}
        </>}
  </section>
}
