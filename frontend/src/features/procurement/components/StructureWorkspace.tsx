import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { procurementApi } from '../api'
import { fieldModes, fieldTypes, type StructureField, type StructureSchema } from '../structureTypes'
import { WorkspaceDialog } from './WorkspaceDialog'
import { WorkspaceState } from './WorkspaceState'

export function StructureWorkspace() {
  const query = useQuery({ queryKey: ['procurement', 'structure'], queryFn: procurementApi.structure })
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState('')
  const [editing, setEditing] = useState<{ field: StructureField; schema: StructureSchema; create: boolean } | null>(null)
  const rows = query.data?.fields.filter(field => (!group || field.group === group)
    && `${field.label} ${field.key} ${field.description}`.includes(search)) ?? []
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3"><h1>数据结构</h1>
      <Button disabled={!query.data} onClick={() => query.data && setEditing({ schema: query.data, create: true, field: {
        key: '', label: '', group: group || '公告信息', type: 'TEXT', mode: 'LLM', description: '', enabled: true,
        order: Math.max(0, ...query.data.fields.map(field => field.order)) + 1,
      } })}><Plus size={16} />新增字段</Button></div>
    <p className="procurement-description">以“销售判断候选”47 列为初始模板。字段说明参与后续智能解析；历史结果保留原版本，人工修正持续保留。</p>
    <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2 border-y border-border py-4 text-sm text-muted-foreground">
      <span>当前版本 <strong className="font-medium text-foreground">v{query.data?.version ?? '—'}</strong></span>
      <span>{query.data?.fields.filter(f => f.enabled).length ?? '—'} 个启用字段</span>
      <span>金额单位：万元</span><span>无依据留空 · 销售判断默认人工维护</span>
    </div>
    <div className="mb-5 grid gap-3 sm:grid-cols-2">
      <input className="procurement-input" aria-label="搜索字段" placeholder="搜索字段名称、键或提取说明" value={search} onChange={e => setSearch(e.target.value)} />
      <select className="procurement-input" aria-label="字段分组" value={group} onChange={e => setGroup(e.target.value)}><option value="">全部分组</option>
        {[...new Set(query.data?.fields.map(field => field.group))].map(name => <option key={name}>{name}</option>)}</select>
    </div>
    {query.isPending || query.isError ? <WorkspaceState error={query.error} retry={() => void query.refetch()} />
      : <div className="procurement-table-wrap"><table className="procurement-table"><thead><tr><th>字段 / 分组</th><th>类型与来源</th><th>提取说明</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>{rows.map(field => <tr key={field.key}><td><p className="font-medium">{field.label}</p><p className="mt-1 text-xs text-muted-foreground">{field.group} · {field.key}</p></td>
          <td className="whitespace-nowrap">{fieldTypes[field.type]}<p className="mt-1 text-xs text-muted-foreground">{fieldModes[field.mode]}</p></td>
          <td className="max-w-md text-muted-foreground"><p className="line-clamp-3">{field.description || '尚未填写提取说明'}</p></td>
          <td className="whitespace-nowrap text-xs">{field.enabled ? '已启用' : '已停用'}</td>
          <td><Button variant="ghost" size="sm" onClick={() => setEditing({ field, schema: query.data, create: false })}>编辑</Button></td></tr>)}</tbody></table>
        {!rows.length && <p className="py-6 text-sm">没有匹配字段。<Button variant="link" onClick={() => { setSearch(''); setGroup('') }}>清除筛选</Button></p>}</div>}
    {editing && <StructureEditor {...editing} close={() => setEditing(null)} />}
  </>
}

function StructureEditor({ field, schema, create, close }: { field: StructureField; schema: StructureSchema; create: boolean; close: () => void }) {
  const [draft, setDraft] = useState(field)
  const client = useQueryClient()
  const save = useMutation({ mutationFn: () => procurementApi.saveStructure({ version: schema.version,
    fields: create ? [...schema.fields, draft] : schema.fields.map(item => item.key === field.key ? draft : item) }),
  onSuccess: () => { void client.invalidateQueries({ queryKey: ['procurement'] }); close() } })
  return <WorkspaceDialog title={create ? '新增字段' : `编辑 ${field.label}`} description="已有字段键和类型保持稳定。停用会隐藏字段并停止提取，保留已存数据。修改用于下次解析。" close={close}>
    <form className="grid gap-4" onSubmit={e => { e.preventDefault(); save.mutate() }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="procurement-form-label">字段名称<input className="procurement-input" required maxLength={100} value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} /></label>
        <label className="procurement-form-label">字段键<input className="procurement-input" required disabled={!create} pattern="[a-z][a-z0-9_]{0,79}" value={draft.key} onChange={e => setDraft({ ...draft, key: e.target.value })} /></label>
        <label className="procurement-form-label">分组<input className="procurement-input" required maxLength={80} value={draft.group} onChange={e => setDraft({ ...draft, group: e.target.value })} /></label>
        <label className="procurement-form-label">排序<input className="procurement-input" required type="number" min={0} max={10000} value={draft.order} onChange={e => setDraft({ ...draft, order: Number(e.target.value) })} /></label>
        <label className="procurement-form-label">字段类型<select className="procurement-input" disabled={!create} value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value as StructureField['type'] })}>
          {Object.entries(fieldTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="procurement-form-label">提取方式<select className="procurement-input" disabled={field.mode === 'SYSTEM'} value={draft.mode} onChange={e => setDraft({ ...draft, mode: e.target.value as StructureField['mode'] })}>
          {Object.entries(fieldModes).filter(([key]) => key !== 'SYSTEM' || field.mode === 'SYSTEM').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      </div>
      <label className="procurement-form-label">提取说明<textarea className="procurement-input" rows={4} maxLength={2000} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
      <p className="text-xs text-muted-foreground">智能解析只接受带原文依据的事实，不生成销售评分或建议。此类业务结论请使用人工维护。</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} />启用字段</label>
      {save.error && <p role="alert" className="text-sm text-destructive">{save.error.message}。如版本冲突，请关闭编辑并刷新页面。</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close}>取消</Button><Button disabled={save.isPending}>{save.isPending ? '保存中' : '保存字段'}</Button></div>
    </form>
  </WorkspaceDialog>
}
