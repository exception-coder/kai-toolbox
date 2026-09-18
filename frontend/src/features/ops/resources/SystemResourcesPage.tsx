import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { OpsPage } from '../pages/OpsPage'
import { ApplicationAccounts } from './ApplicationAccounts'
import { discoverResources, removeResourceBinding, resourceCatalog, saveResourceBinding, testResource, type ResourceBinding } from './api'

const states: Record<string, string> = { AVAILABLE: '可调用', DISABLED: '已停用', UNAVAILABLE: '源资源不可用', RESTRICTED: '环境受限', REGISTRATION_ONLY: '仅登记 / 尚未配置' }

export function SystemResourcesPage() {
  const [search, setSearch] = useSearchParams()
  const view = search.get('view') ?? 'relations'
  return <main className="mx-auto max-w-7xl space-y-6 p-6 md:p-8">
    <header className="space-y-3 border-b pb-5">
      <Link to="/tools/reqpool" className="text-xs text-muted-foreground hover:text-foreground">← AI 交付中心</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Forge 系统资源</h1>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">集中配置各系统的数据库和应用站点。Forge 通过统一工具动态发现已绑定资源；账号密码只由服务端使用，不进入会话上下文。</p>
    </header>
    <nav aria-label="系统资源视图" className="flex flex-wrap gap-2 border-b pb-3">
      {([['relations', '系统绑定'], ['connections', '数据库与中间件'], ['accounts', '应用站点']] as const).map(([key, label]) => <Button key={key} variant={view === key ? 'secondary' : 'ghost'} onClick={() => setSearch(previous => { const next = new URLSearchParams(previous); next.set('view', key); return next })}>{label}</Button>)}
    </nav>
    {view === 'connections' ? <section className="space-y-4"><p className="text-sm leading-6 text-muted-foreground">这里保留原有连接分组与查询历史。分组名称不代表已关联项目库系统；保存连接后，请到“系统关联”确认所属系统与用途。</p><OpsPage /></section> : view === 'accounts' ? <ApplicationAccounts /> : <ResourceRelations />}
  </main>
}

function ResourceRelations() {
  const client = useQueryClient()
  const catalog = useQuery({ queryKey: ['system-resources'], queryFn: resourceCatalog })
  const [system, setSystem] = useState('')
  const [selection, setSelection] = useState('')
  const [purpose, setPurpose] = useState('')
  const [result, setResult] = useState('')
  const resources = useQuery({ queryKey: ['system-resources', system], queryFn: () => discoverResources(system), enabled: !!system })
  const refresh = () => client.invalidateQueries({ queryKey: ['system-resources'] })
  const save = useMutation({ mutationFn: saveResourceBinding, onSuccess: () => { setSelection(''); setPurpose(''); void refresh() } })
  const remove = useMutation({ mutationFn: removeResourceBinding, onSuccess: refresh })
  const test = useMutation({ mutationFn: testResource, onSuccess: value => setResult(JSON.stringify(value, null, 2)) })
  const error = catalog.error ?? resources.error ?? save.error ?? remove.error ?? test.error
  const busy = save.isPending || remove.isPending || test.isPending
  const available = catalog.data?.resources ?? []
  const selected = available.find(item => `${item.providerId}:${item.resource.id}` === selection)
  const bind = () => {
    if (selected && system) save.mutate({ systemId: system, providerId: selected.providerId, resourceId: selected.resource.id, purpose, enabled: true })
  }
  const toggle = (binding: ResourceBinding) => save.mutate({ ...binding, enabled: !binding.enabled })
  return <section className="space-y-5">
    <div className="flex flex-wrap items-end gap-4">
      <label className="space-y-2 text-sm"><span className="block font-medium">项目库系统</span><select aria-label="项目库系统" className="min-w-64 rounded-md border bg-background px-3 py-2" value={system} onChange={event => { setSystem(event.target.value); setResult('') }}><option value="">请选择系统</option>{catalog.data?.systems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <Button variant="outline" onClick={() => void refresh()} disabled={catalog.isFetching}>刷新资源</Button>
      <Link to="/tools/project-workspace" className="py-2 text-sm text-primary">前往项目库登记系统</Link>
    </div>
    {catalog.isPending && <p role="status">正在读取资源目录…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error instanceof Error ? error.message : '读取失败，请刷新重试'}</p>}
    {!!catalog.data?.unavailableProviders.length && <p role="status" className="text-sm text-muted-foreground">以下连接器暂不可用：{catalog.data.unavailableProviders.join('、')}。已保存的关联仍然保留。</p>}
    {!system ? <p className="border-y py-8 text-sm text-muted-foreground">选择系统后查看 AI 能发现的资源。现有配置不会自动归属到名称相似的系统，请确认用途后关联。</p> : <>
      <div className="flex flex-wrap items-end gap-3 border-y py-4">
        <label className="min-w-60 flex-1 space-y-2 text-sm"><span className="block">可关联资源</span><select aria-label="可关联资源" className="w-full rounded-md border bg-background px-3 py-2" value={selection} onChange={event => setSelection(event.target.value)}><option value="">选择已有连接或账号</option>{available.filter(item => !resources.data?.some(bound => bound.binding.providerId === item.providerId && bound.binding.resourceId === item.resource.id)).map(item => <option key={`${item.providerId}:${item.resource.id}`} value={`${item.providerId}:${item.resource.id}`}>{item.resource.name} · {item.resource.environment} · {item.providerId}</option>)}</select></label>
        <label className="flex-1 space-y-2 text-sm"><span className="block">用途</span><input aria-label="资源用途" maxLength={500} className="w-full rounded-md border bg-background px-3 py-2" value={purpose} onChange={event => setPurpose(event.target.value)} placeholder="例如：订单查询、测试管理员登录" /></label>
        <Button disabled={!selected || busy || resources.isPending} onClick={bind}>关联资源</Button>
      </div>
      {resources.isPending ? <p role="status">正在读取系统关联…</p> : !resources.data?.length ? <p className="py-6 text-sm text-muted-foreground">该系统尚未关联资源。先在“中间件连接”或“测试应用账号”配置，再从上方关联。</p> : <ul className="divide-y">{resources.data.map(({ binding, resource, state }) => <li key={binding.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
        <div className="min-w-0 space-y-1"><h2 className="text-sm font-semibold">{resource?.name ?? binding.resourceId} <span className="ml-2 font-normal text-muted-foreground">{states[state] ?? state}</span></h2><p className="break-all text-xs text-muted-foreground">{resource?.kind} · {resource?.environment} · {resource?.endpoint}</p><p className="text-xs text-muted-foreground">账号：{resource?.account || '未设置'} · {resource?.credentialConfigured ? '已配置凭据' : '未配置密码'} · 能力：{resource?.capabilities.join(' / ') || '仅登记'}</p><p className="text-sm">{binding.purpose || '未填写用途'}</p></div>
        <div className="flex flex-wrap gap-2">{resource && <Link className="px-2 py-2 text-xs text-primary" to={resource.configurationUrl}>编辑源配置</Link>}<Button size="sm" variant="outline" disabled={busy || state !== 'AVAILABLE' || !resource?.capabilities.includes('TEST')} onClick={() => { setResult(''); test.mutate(binding.id) }}>测试连接</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => toggle(binding)}>{binding.enabled ? '停用' : '启用'}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => remove.mutate(binding.id)}>解除关联</Button></div>
      </li>)}</ul>}
      <p className="text-xs leading-5 text-muted-foreground">解除关联只移除系统引用，保留源配置与历史。数据库查询由服务端强制只读；生产或未知环境不可执行。MQ 等未实现连接器的资源仅用于登记。</p>
    </>}
    {result && <section aria-live="polite"><h2 className="mb-2 text-sm font-medium">连接测试结果</h2><pre className="overflow-auto rounded-md border p-3 text-xs">{result}</pre></section>}
  </section>
}
