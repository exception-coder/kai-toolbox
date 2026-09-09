import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { procurementApi } from '../api'
import { valueSources, type StructuredResult } from '../structureTypes'
import { WorkspaceState } from './WorkspaceState'

export function StructuredNotice({ id }: { id: string }) {
  const [group, setGroup] = useState('')
  const query = useQuery({ queryKey: ['procurement', 'structured', id], queryFn: () => procurementApi.structured(id) })
  if (!query.data || query.isError) return <WorkspaceState error={query.error} retry={() => void query.refetch()} />
  return <StructuredForm key={`${id}-${query.data.schemaVersion}-${query.data.version}`} id={id} result={query.data} group={group} setGroup={setGroup} />
}

function StructuredForm({ id, result, group, setGroup }: { id: string; result: StructuredResult; group: string; setGroup: (value: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(result.overrides)
  const client = useQueryClient()
  const save = useMutation({ mutationFn: () => procurementApi.correct(id, { schemaVersion: result.schemaVersion, version: result.version, values: draft }),
    onSuccess: data => { setEditing(false); client.setQueryData(['procurement', 'structured', id], data) } })
  const groups = [...new Set(result.values.map(item => item.field.group))]
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
      <p className="text-xs text-muted-foreground">结构 v{result.schemaVersion} · {result.analysisVersion ? `解析使用 v${result.analysisVersion}` : '尚无版本化解析'} · {result.values.filter(item => item.value).length}/{result.values.length} 项已填</p>
      {!editing && <Button size="sm" variant="outline" onClick={() => { setEditing(true); save.reset() }}>修正数据</Button>}
    </div>
    <p className="my-3 text-xs leading-relaxed text-muted-foreground">空值表示待补充，不等于零。人工修正不会被重采或解析覆盖；恢复自动值后可重新采用解析结果。</p>
    {result.version > 0 && <p role="status" className="my-3 text-xs text-muted-foreground">人工修正记录已保存 · 修订 {result.version}</p>}
    {result.analysisVersion > 0 && result.analysisVersion !== result.schemaVersion && <p className="my-3 text-sm text-muted-foreground">结构已更新，旧解析仍保留。可返回列表点击“解析”按新结构重新提取。</p>}
    <label className="mb-4 block"><span className="sr-only">查看分组</span><select className="procurement-input" value={group} onChange={e => setGroup(e.target.value)}>
      <option value="">全部分组</option>{groups.map(name => <option key={name}>{name}</option>)}</select></label>
    <form onSubmit={e => { e.preventDefault(); save.mutate() }}>
      {groups.filter(name => !group || name === group).map(name => <section key={name} className="mb-6"><h3 className="border-b border-border pb-3 text-sm font-medium">{name}</h3>
        <dl className="divide-y divide-border">{result.values.filter(item => item.field.group === name).map(item => {
          const field = item.field
          const hasDraft = Object.prototype.hasOwnProperty.call(draft, field.key)
          const display = hasDraft ? draft[field.key] : item.overridden ? (item.alternatives.length === 1 ? item.alternatives[0] : '') : item.value
          return <div key={field.key} className="py-4 text-sm">
            <dt className="mb-2 flex flex-wrap justify-between gap-2"><label htmlFor={`value-${field.key}`} className="font-medium">{field.label}</label>
              <span className="text-xs text-muted-foreground">{editing ? hasDraft ? '人工修正' : item.overridden ? '恢复自动值（待保存）' : valueSources[item.source] : valueSources[item.source]}</span></dt>
            <dd>{editing && field.mode !== 'SYSTEM' ? <>
              <textarea id={`value-${field.key}`} className="procurement-input" rows={field.type === 'TEXT' ? 2 : 1} maxLength={4000}
                placeholder={field.type === 'DECIMAL' ? '数字；金额单位为万元' : field.type === 'DATE' ? 'YYYY-MM-DD' : '留空可保存为空值'}
                value={display} onChange={e => setDraft({ ...draft, [field.key]: e.target.value })} />
              <div className="mt-1 flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{field.description}</span>
                {hasDraft && <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => { const next = { ...draft }; delete next[field.key]; setDraft(next) }}>恢复自动值</Button>}</div>
            </> : <p className="whitespace-pre-wrap break-words leading-relaxed">{item.value || '—'}</p>}</dd>
            {item.evidence.length > 0 && <dd><details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer py-1">{item.alternatives.length > 1 ? `存在 ${item.alternatives.length} 个候选值，查看依据` : '查看原文依据'}</summary>
              {item.evidence.map((fact, index) => <blockquote key={index} className="my-2 border-l-2 border-border pl-3 leading-relaxed"><p className="mb-1">{fact.section} · {fact.value}</p>{fact.evidence}</blockquote>)}</details></dd>}
          </div>
        })}</dl></section>)}
      {save.error && <p role="alert" className="mb-3 text-sm text-destructive">{save.error.message}。如版本冲突，请重新打开公告详情。</p>}
      {editing && <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-background py-3">
        <Button type="button" variant="outline" onClick={() => { setDraft(result.overrides); setEditing(false); save.reset() }}>取消</Button>
        <Button disabled={save.isPending}>{save.isPending ? '保存中' : '保存修正'}</Button></div>}
    </form>
  </>
}
