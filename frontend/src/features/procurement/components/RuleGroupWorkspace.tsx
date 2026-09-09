import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { procurementApi } from '../api'
import type { Rule } from '../types'
import type { RuleGroup } from '../ruleGroupTypes'
import { WorkspaceState } from './WorkspaceState'
import { WorkspaceDialog } from './WorkspaceDialog'
import { RuleEditor } from './RuleEditor'

const kinds = ['字段解析', '行业筛选', '分类字典', '自定义规则']

export function RuleGroupWorkspace() {
  const [kind, setKind] = useState('字段解析')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<RuleGroup | null>(null)
  const [sourceEditing, setSourceEditing] = useState<Rule | null>(null)
  const query = useQuery({ queryKey: ['procurement', 'rule-groups'], queryFn: procurementApi.ruleGroups })
  const groups = query.data ?? []
  const rows = groups.filter(g => g.kind === kind && JSON.stringify(g).includes(search))
  return <>
    <h1>规则管理</h1>
    <p className="procurement-description">按判定目的维护词组、共用规则与例外。解析只使用当前目标字段相关的规则；修改用于下次解析。</p>
    <div className="mb-5 flex flex-wrap gap-2" aria-label="规则用途">{kinds.filter(k => k !== '自定义规则' || groups.some(g => g.kind === k)).map(k =>
      <Button key={k} variant={kind === k ? 'secondary' : 'ghost'} aria-pressed={kind === k} onClick={() => setKind(k)}>{k} <span className="text-xs text-muted-foreground">{groups.filter(g => g.kind === k).length}</span></Button>)}</div>
    <input className="procurement-input mb-5 max-w-lg" aria-label="搜索规则" placeholder="搜索判定目的、词组或原始条目" value={search} onChange={e => setSearch(e.target.value)} />
    {kind === '行业筛选' && <p className="mb-5 text-sm text-muted-foreground">用于管网、产品与规格判断。对应字段未启用时，不参与基本业务字段解析。</p>}
    {query.isPending || query.isError ? <WorkspaceState error={query.error} retry={() => void query.refetch()} /> :
      <div className="divide-y border-y">{rows.map(group => <section key={group.rule.id} className="py-5">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-medium">{group.rule.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{group.sources.length} 个来源条目 · {group.rule.enabled ? '已启用' : '已停用'}</p></div>
          <Button variant="outline" size="sm" onClick={() => group.rule.category === 'GROUP' ? setEditing(group) : setSourceEditing(group.sources[0])}>编辑</Button></div>
        <p className="mt-3 text-sm">{group.rule.fields['判定规则'] || group.rule.name}</p>
        {group.rule.fields['词组'] && <p className="mt-2 text-sm leading-6 text-muted-foreground">词组：{group.rule.fields['词组']}</p>}
        {group.rule.fields['边界条件'] && <p className="mt-2 text-sm text-muted-foreground">例外与边界：{group.rule.fields['边界条件']}</p>}
        <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted-foreground">{kind === '分类字典' ? '查看与维护分类项' : '查看合并来源'}</summary>
          {kind !== '分类字典' && <p className="mt-2 text-xs text-muted-foreground">原始条目用于追溯；新解析使用上方合并规则。</p>}
          <div className="mt-3 divide-y">{group.sources.map(source => <div key={source.id} className="py-3">
            <div className="flex items-center justify-between"><span>{source.id} · {source.name}{!source.enabled && '（已停用）'}</span>
              {kind === '分类字典' && <Button variant="ghost" size="sm" onClick={() => setSourceEditing(source)}>编辑分类</Button>}</div>
            <dl className="mt-2 text-xs text-muted-foreground">{Object.entries(source.fields).filter(([, value]) => value).map(([key, value]) => <div key={key} className="mt-1"><dt className="inline">{key}：</dt><dd className="inline">{value}</dd></div>)}</dl>
          </div>)}</div></details>
      </section>)}{!rows.length && <p className="py-8 text-sm">没有匹配规则。<Button variant="link" onClick={() => setSearch('')}>清除搜索</Button></p>}</div>}
    {editing && <GroupEditor group={editing} close={() => setEditing(null)} />}
    {sourceEditing && <RuleEditor initial={sourceEditing} create={false} close={() => setSourceEditing(null)} />}
  </>
}

function GroupEditor({ group, close }: { group: RuleGroup; close: () => void }) {
  const [draft, setDraft] = useState(group.rule)
  const client = useQueryClient()
  const save = useMutation({ mutationFn: () => procurementApi.saveRuleGroup(draft), onSuccess: () => {
    void client.invalidateQueries({ queryKey: ['procurement'] }); close()
  } })
  return <WorkspaceDialog title={`编辑 ${group.rule.name}`} description="同一目的共用一条判定；在词组中增加表达，在边界条件中保留例外。" close={close}>
    <form className="grid gap-4" onSubmit={e => { e.preventDefault(); save.mutate() }}>
      <label className="procurement-form-label">判定目的<input className="procurement-input" required maxLength={300} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      {Object.entries(draft.fields).map(([key, value]) => <label key={key} className="procurement-form-label">{key}
        <textarea className="procurement-input" rows={key === '词组' ? 4 : 2} maxLength={12000} value={value} onChange={e => setDraft({ ...draft, fields: { ...draft.fields, [key]: e.target.value } })} />
        {key === '适用字段' && <span className="text-xs text-muted-foreground">填写数据结构中的字段键，以英文逗号分隔；* 表示所有字段。</span>}</label>)}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} />启用此组</label>
      {save.error && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close}>取消</Button><Button disabled={save.isPending}>{save.isPending ? '保存中…' : '保存规则'}</Button></div>
    </form>
  </WorkspaceDialog>
}
