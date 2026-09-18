import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { createApplicationResource, deleteApplicationResource, listApplicationResources, updateApplicationResource, type ApplicationResource, type ApplicationResourceInput } from './api'

const empty: ApplicationResourceInput = { name: '', environment: 'TEST', baseUrl: '', authType: 'NONE', loginPath: '', username: '', usernameField: 'username', passwordField: 'password', tokenJsonPath: 'data.accessToken', tenantHeader: '', tenantValue: '', password: '' }

export function ApplicationAccounts() {
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['application-resources'], queryFn: listApplicationResources })
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: ['application-resources'] }), client.invalidateQueries({ queryKey: ['system-resources'] })]) }
  const remove = useMutation({ mutationFn: deleteApplicationResource, onSuccess: refresh })
  return <section className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4"><div><h2 className="text-base font-semibold">应用站点账号</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">配置本地、开发、测试或 UAT 站点。密码只由服务端保存和使用；保存后在“系统关联”中绑定到对应系统。</p></div><Button onClick={() => setEditing('new')}>新增应用</Button></div>
    {query.isPending && <p role="status">正在读取应用资源…</p>}
    {query.error && <p role="alert" className="text-sm text-destructive">{query.error.message}</p>}
    {!query.isPending && !query.data?.length && editing !== 'new' && <p className="border-b py-8 text-sm text-muted-foreground">尚未配置应用站点。新增后可绑定到任意项目库系统。</p>}
    <ul className="divide-y">{query.data?.map(item => <li key={item.id} className="py-4">{editing === item.id ? <ApplicationEditor value={item} onDone={() => { setEditing(null); void refresh() }} /> : <div className="flex flex-wrap items-center justify-between gap-4"><div className="min-w-0"><h3 className="text-sm font-medium">{item.name}</h3><p className="mt-1 break-all text-xs text-muted-foreground">{item.environment} · {item.baseUrl} · {authLabel(item.authType)}</p><p className="mt-1 text-xs text-muted-foreground">账号：{item.username || '无需登录'} · {item.credentialConfigured ? '凭据已配置' : item.authType === 'NONE' ? '无需凭据' : '缺少密码'}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setEditing(item.id)}>编辑</Button><Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(item.id)}>删除</Button></div></div>}</li>)}</ul>
    {editing === 'new' && <div className="border-t pt-5"><ApplicationEditor onDone={() => { setEditing(null); void refresh() }} /></div>}
    {remove.error && <p role="alert" className="text-sm text-destructive">{remove.error.message}</p>}
  </section>
}

function ApplicationEditor({ value, onDone }: { value?: ApplicationResource; onDone: () => void }) {
  const [draft, setDraft] = useState<ApplicationResourceInput>(value ? { ...value, password: '' } : empty)
  useEffect(() => setDraft(value ? { ...value, password: '' } : empty), [value])
  const save = useMutation({ mutationFn: () => value ? updateApplicationResource(value.id, draft) : createApplicationResource(draft), onSuccess: onDone })
  const field = (key: keyof ApplicationResourceInput, label: string, type = 'text') => <label className="space-y-1 text-sm"><span>{label}</span><input type={type} className="w-full rounded-md border bg-background px-3 py-2" value={String(draft[key] ?? '')} onChange={event => setDraft(previous => ({ ...previous, [key]: event.target.value }))} /></label>
  const needsLogin = draft.authType !== 'NONE'
  return <form className="space-y-4" onSubmit={event => { event.preventDefault(); save.mutate() }}><div className="grid gap-4 md:grid-cols-2">{field('name', '资源名称')}<label className="space-y-1 text-sm"><span>环境</span><select className="w-full rounded-md border bg-background px-3 py-2" value={draft.environment} onChange={event => setDraft(previous => ({ ...previous, environment: event.target.value }))}>{['LOCAL', 'DEV', 'TEST', 'UAT', 'PROD'].map(item => <option key={item}>{item}</option>)}</select></label><div className="md:col-span-2">{field('baseUrl', '实例地址')}</div><label className="space-y-1 text-sm"><span>登录方式</span><select className="w-full rounded-md border bg-background px-3 py-2" value={draft.authType} onChange={event => setDraft(previous => ({ ...previous, authType: event.target.value as ApplicationResourceInput['authType'] }))}><option value="NONE">无需登录</option><option value="FORM_COOKIE">表单登录 / Cookie</option><option value="JSON_BEARER">JSON 登录 / Bearer Token</option></select></label>{needsLogin && field('loginPath', '登录路径')}{needsLogin && field('username', '登录账号')}{needsLogin && field('password', value?.credentialConfigured ? '密码（留空保留）' : '密码', 'password')}{needsLogin && field('usernameField', '账号字段')}{needsLogin && field('passwordField', '密码字段')}{draft.authType === 'JSON_BEARER' && field('tokenJsonPath', 'Token JSON 路径')}{draft.authType === 'JSON_BEARER' && field('tenantHeader', '租户 Header（可选）')}{draft.authType === 'JSON_BEARER' && field('tenantValue', '租户值（可选）')}</div><div className="flex items-center gap-2 border-t pt-4"><Button type="submit" disabled={save.isPending || !draft.name.trim() || !draft.baseUrl.trim()}>{save.isPending ? '正在保存…' : '保存'}</Button><Button type="button" variant="ghost" onClick={onDone}>取消</Button>{save.error && <span role="alert" className="text-sm text-destructive">{save.error.message}</span>}</div></form>
}

function authLabel(value: ApplicationResource['authType']) { return value === 'NONE' ? '无需登录' : value === 'FORM_COOKIE' ? '表单 Cookie' : 'JSON Bearer' }
