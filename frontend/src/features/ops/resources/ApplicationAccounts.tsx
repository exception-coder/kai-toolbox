import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/api'
import { Button } from '@/components/ui/button'

const connectors = [
  { id: 'erp-app', name: 'ERP 测试应用', fields: [['baseUrl', '实例地址'], ['loginPath', '登录路径'], ['userField', '用户名字段'], ['passField', '密码字段'], ['username', '测试账号']] },
  { id: 'srm-app', name: 'SRM 测试应用', fields: [['baseUrl', '实例地址'], ['loginPath', '登录路径'], ['tenantId', '租户标识'], ['tokenJsonPath', '令牌响应路径'], ['username', '测试账号']] },
] as const
type AccountConfig = Record<string, string | boolean>

export function ApplicationAccounts() {
  return <section className="space-y-6"><p className="text-sm leading-6 text-muted-foreground">复用已有应用连接器的登录配置，每个连接器当前支持一组账号。保存后到“系统关联”选择所属系统；这里不会自动关联，也不会把密码返回给 AI。</p><div className="grid gap-8 lg:grid-cols-2">{connectors.map(connector => <AccountEditor key={connector.id} connector={connector} />)}</div></section>
}

function AccountEditor({ connector }: { connector: typeof connectors[number] }) {
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['resource-account', connector.id], queryFn: () => http<AccountConfig>(`/claude-chat/${connector.id}/config`) })
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const save = useMutation({ mutationFn: () => {
    const body = Object.fromEntries(connector.fields.map(([key]) => [key, draft[key] ?? query.data?.[key] ?? '']))
    return http<AccountConfig>(`/claude-chat/${connector.id}/config`, { method: 'PUT', body: JSON.stringify({ ...body, password: draft.password ?? '' }) })
  }, onSuccess: data => {
    client.setQueryData(['resource-account', connector.id], data)
    setDraft({}); setSaved(true)
    void client.invalidateQueries({ queryKey: ['system-resources'] })
  } })
  return <form className="space-y-4 border-t pt-4" onSubmit={event => { event.preventDefault(); setSaved(false); save.mutate() }}>
    <h2 className="font-semibold">{connector.name}</h2>
    {query.isPending ? <p role="status">正在读取账号配置…</p> : <>
      {connector.fields.map(([key, label]) => <label key={key} className="block space-y-1 text-sm"><span>{label}</span><input className="w-full rounded-md border bg-background px-3 py-2" value={draft[key] ?? String(query.data?.[key] ?? '')} onChange={event => { setSaved(false); setDraft(previous => ({ ...previous, [key]: event.target.value })) }} autoComplete="off" /></label>)}
      <label className="block space-y-1 text-sm"><span>密码 {query.data?.hasPassword ? '（已配置；留空保留）' : '（尚未配置）'}</span><input type="password" autoComplete="new-password" className="w-full rounded-md border bg-background px-3 py-2" value={draft.password ?? ''} onChange={event => setDraft(previous => ({ ...previous, password: event.target.value }))} /></label>
      <Button variant="outline" type="submit" disabled={save.isPending || query.isError}>{save.isPending ? '正在保存…' : '保存账号配置'}</Button>
    </>}
    {(query.error || save.error) && <p role="alert" className="text-sm text-destructive">{(query.error ?? save.error)?.message}</p>}
    {saved && <p role="status" className="text-sm text-muted-foreground">配置已保存，可到系统关联中绑定并测试。</p>}
  </form>
}
