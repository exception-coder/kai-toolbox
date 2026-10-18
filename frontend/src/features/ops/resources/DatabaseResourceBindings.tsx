import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { resourceCatalog, saveResourceBinding, type ResourceBinding, type ResourceDescriptor } from './api'
import { SavedDatabaseEditor } from './SavedDatabaseEditor'

const allowedEnvironments = new Set(['LOCAL', 'DEV', 'TEST', 'UAT'])
const pathKey = (path?: string | null) => path?.replaceAll('\\', '/').replace(/\/+$/, '')

/** 管理已有系统与原资源的多对多引用，发布选择仍由 Agent 管理负责。 */
export function DatabaseResourceBindings(props: { sourcePath?: string }) { return <SystemResourceBindings {...props} kind="DB" /> }
export function WebResourceBindings(props: { sourcePath?: string }) { return <SystemResourceBindings {...props} kind="APP" /> }

function SystemResourceBindings({ sourcePath, kind }: { sourcePath?: string; kind: 'DB' | 'APP' }) {
  const web = kind === 'APP'
  const label = web ? 'Web账号' : '数据库'
  const providerId = web ? 'application' : 'datasource'
  const client = useQueryClient()
  const catalog = useQuery({ queryKey: ['system-resources'], queryFn: resourceCatalog })
  const [chosenSystem, setChosenSystem] = useState<string | null>(null)
  const [resourceId, setResourceId] = useState('')
  const [purpose, setPurpose] = useState('')
  const [editing, setEditing] = useState<ResourceBinding | null>(null)
  const [connection, setConnection] = useState<string | null>(null)
  const matches = sourcePath ? catalog.data?.systems.filter(system => pathKey(system.sourcePath) === pathKey(sourcePath)) ?? [] : []
  const systemId = chosenSystem ?? (matches.length === 1 ? matches[0].id : '')
  const resources = catalog.data?.resources.filter(entry => entry.providerId === providerId && (web || entry.resource.capabilities.includes('QUERY'))) ?? []
  // 保留失效关联供管理员修复；不能因为目录缺失而静默隐藏已有授权。
  const bindings = catalog.data?.bindings.filter(binding => binding.systemId === systemId && binding.providerId === providerId) ?? []
  const source = (id: string) => resources.find(entry => entry.resource.id === id)?.resource
  const permitted = (id: string) => allowedEnvironments.has(source(id)?.environment.trim().toUpperCase() ?? '') && (!web || (!!source(id)?.credentialConfigured && !!source(id)?.account?.trim()))
  const save = useMutation({ mutationFn: saveResourceBinding, onSuccess: () => {
    setEditing(null); setResourceId(''); setPurpose('')
    for (const queryKey of [['system-resources'], ['consult-database-configuration'], ['agent-management', 'consult-resources']]) {
      void client.invalidateQueries({ queryKey })
    }
  } })
  const submit = () => {
    if (!systemId || (!editing && (!resourceId || !permitted(resourceId)))) return
    save.mutate({ systemId, providerId, resourceId: editing?.resourceId ?? resourceId, purpose, enabled: editing?.enabled ?? true })
  }
  return <div className="space-y-3 text-sm">
    <p className="text-xs leading-5 text-muted-foreground">一个系统可以关联多个{label}。关联只保存引用，不复制凭据；跨系统分析需管理员明确关联，不自动扩大范围。{web && ' 按环境登记应用地址与账号，AI优先匹配用户URL；环境不明确时才询问地址。'}</p>
    <div className="flex items-end gap-2">
      <label className="min-w-0 flex-1 space-y-1 text-xs">关联到项目库系统
        <select aria-label="关联到项目库系统" className="min-h-11 w-full rounded-md border bg-background px-2" value={systemId} disabled={save.isPending || !!editing || !!connection}
          onChange={event => { setChosenSystem(event.target.value); setResourceId(''); setPurpose(''); save.reset() }}>
          <option value="">请选择已登记系统</option>
          {catalog.data?.systems.map(system => <option key={system.id} value={system.id}>{system.name} · {system.sourcePath || system.id}</option>)}
        </select>
      </label>
      <Button variant="ghost" disabled={catalog.isFetching || save.isPending} onClick={() => void catalog.refetch()}>刷新关联</Button>
    </div>
    {catalog.isPending && <p role="status">正在读取系统关联…</p>}
    {catalog.isError && <p role="alert" className="text-xs text-destructive">关联目录读取失败，请刷新重试；已有草稿保留。</p>}
    {!!catalog.data?.unavailableProviders.length && <p role="alert" className="text-xs text-destructive">部分资源提供方不可用，目录可能不完整，请恢复后刷新。</p>}
    {catalog.isSuccess && !systemId && <p className="text-xs text-muted-foreground">当前目录尚未唯一匹配项目库系统，请明确选择；不会按系统名称猜测。</p>}
    {catalog.isSuccess && systemId && <>
      <p className="text-xs">已关联 {bindings.length} 个{label} · 停用会立即禁止后续访问</p>
      <ul className="divide-y">{bindings.map(binding => <ResourceBindingRow key={binding.id} binding={binding} item={source(binding.resourceId)}
        web={web} permitted={permitted(binding.resourceId)} disabled={save.isPending || !!editing || !!connection}
        onEdit={() => { setEditing(binding); setPurpose(binding.purpose); save.reset() }} onConnection={() => setConnection(binding.resourceId)} />)}</ul>
      {!connection && <fieldset disabled={save.isPending || !catalog.isSuccess} className="min-w-0 space-y-3 border-t pt-3">
        <legend className="text-xs font-medium">{editing ? `编辑${label}关联` : `继续关联${label}`}</legend>
        {!editing && <label className="block space-y-1 text-xs">{label}
          <select aria-label={`可关联${label}`} className="min-h-11 w-full rounded-md border bg-background px-2" value={resourceId} onChange={event => { setResourceId(event.target.value); save.reset() }}>
            <option value="">选择已登记{label}</option>
            {resources.filter(entry => !bindings.some(binding => binding.resourceId === entry.resource.id)).map(({ resource }) =>
              <option key={resource.id} value={resource.id} disabled={!permitted(resource.id)}>{resource.name} · {resource.environment} · {resource.endpoint}{web && ` · ${resource.account}`}</option>)}
          </select>
        </label>}
        <label className="block space-y-1 text-xs">资源用途
          <input aria-label="资源用途" maxLength={500} className="min-h-11 w-full rounded-md border bg-background px-3" value={purpose} onChange={event => { setPurpose(event.target.value); save.reset() }} />
        </label>
        {editing && <label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={editing.enabled} onChange={event => setEditing({ ...editing, enabled: event.target.checked })} />启用关联</label>}
        <div className="flex gap-2"><Button variant="outline" disabled={!catalog.isSuccess || save.isPending || (!editing && (!resourceId || !permitted(resourceId)))} onClick={submit}>{save.isPending ? '正在保存…' : editing ? '保存关联' : `关联${label}`}</Button>
          {editing && <Button variant="ghost" onClick={() => { setEditing(null); setPurpose(''); save.reset() }}>取消关联编辑</Button>}</div>
        <p className="text-xs text-muted-foreground">仅可新增关联 LOCAL / DEV / TEST / UAT {label}。没有目标连接？请先在资源中心登记，返回后刷新。</p>
      </fieldset>}
    </>}
    {save.isError && <p role="alert" className="text-xs text-destructive">关联保存失败，草稿已保留。请先刷新核对实际结果，再重试。</p>}
    {save.isSuccess && <p role="status" className="text-xs">关联已保存。新增关联还需在流程资源中勾选、保存候选并发布。</p>}
    {connection && <SavedDatabaseEditor key={connection} id={connection} onClose={() => setConnection(null)} />}
    <a className="inline-flex min-h-11 items-center text-xs underline" href={web ? "/tools/reqpool/resources?view=accounts" : "/tools/reqpool/resources?view=connections"} target="_blank" rel="noreferrer">登记{label} ↗</a>
    {catalog.isSuccess && !systemId && <a className="ml-4 inline-flex min-h-11 items-center text-xs underline" href="/tools/project-workspace" target="_blank" rel="noreferrer">登记项目库系统 ↗</a>}
  </div>
}

function ResourceBindingRow({ binding, item, web, permitted, disabled, onEdit, onConnection }: {
  binding: ResourceBinding; item?: ResourceDescriptor; web: boolean; permitted: boolean; disabled: boolean
  onEdit: () => void; onConnection: () => void
}) {
  return <li className="space-y-1 py-3 text-xs">
    <p className="break-all font-medium">{item?.name ?? `失效连接 ${binding.resourceId}`} · {binding.enabled ? '已启用' : '已停用'}</p>
    <p className="break-all font-mono text-muted-foreground">{item?.endpoint ?? '连接不可用'} · {item?.environment ?? '未知环境'}</p>
    <p className="break-words">用途：{binding.purpose || '未填写'}</p>
    {item && !permitted && <p className="text-destructive">环境或账号配置不满足咨询访问条件。</p>}
    <div className="flex flex-wrap gap-x-4">
      <button className="min-h-11 underline" disabled={disabled} onClick={onEdit}>编辑关联</button>
      {web ? <a className="inline-flex min-h-11 items-center underline" href={item?.configurationUrl ?? '/tools/reqpool/resources?view=accounts'} target="_blank" rel="noreferrer">编辑Web账号 ↗</a>
        : <button className="min-h-11 underline" disabled={disabled || !item} onClick={onConnection}>编辑连接</button>}
    </div>
  </li>
}
