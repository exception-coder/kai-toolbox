import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, KeyRound, Plus, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { getBackendManagement } from '../consultBackendAdmin'
import { ConsultBackendGrantSheet, type GrantAction } from '../components/ConsultBackendGrantSheet'

export function ConsultBackendAccessPage() {
  const { user } = useAuth()
  if (!user?.roles.includes('ADMIN')) return <div className="space-y-4 p-6"><h1 className="text-lg font-semibold">应用接入凭据</h1><p className="text-sm text-muted-foreground">请使用本实例的管理员身份管理应用授权。</p><Link className="inline-flex min-h-11 items-center text-sm underline" to="/tools/fore-consult">返回业务咨询</Link></div>
  return <AccessManagement key={user.userId} owner={user.userId} />
}

function AccessManagement({ owner }: { owner: number }) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [action, setAction] = useState<GrantAction | null>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const management = useQuery({ queryKey: ['consult-backend-management', owner, query], queryFn: () => getBackendManagement(query), retry: false })
  function begin(value: GrantAction, target: HTMLElement) { trigger.current = target; setAction(value) }
  return <main className="flex h-full min-h-0 flex-col bg-background text-foreground">
    <header className="shrink-0 space-y-4 border-b px-5 py-5 sm:px-8">
      <Link to="/tools/fore-consult" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />业务咨询</Link>
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2"><h1 className="text-xl font-semibold tracking-tight">应用接入凭据</h1><p className="max-w-2xl text-sm leading-6 text-muted-foreground">在当前 Forge 实例为应用颁发独立身份。SDK 自动换取短期票据，不使用员工或管理员密码调用分析接口。</p></div>
        <Button className="min-h-11" disabled={!management.data || management.isFetching} onClick={event => begin({ type: 'create' }, event.currentTarget)}><Plus />颁发凭据</Button></div>
    </header>
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-8">
      {management.data && <section aria-label="本实例接入状态" className="space-y-2 border-b pb-5 text-sm">
        <p className="font-medium">{management.data.enabled ? '分析接口已启用' : '分析接口尚未启用，可先管理授权'}</p>
        <p className="text-xs leading-6 text-muted-foreground">当前站点：{window.location.origin}。凭据仅属于本实例；同事本地运行 Forge 时，应在其本地页面创建。</p>
        {!management.data.enabled && <p className="text-xs leading-6 text-muted-foreground">管理员需在本机 scripts/run-tools.d 配置 FORGE_CONSULT_BACKEND_ENABLED=true，经确认重启后生效。本页不会自动启用或重启服务。</p>}
      </section>}
      <form className="flex flex-wrap items-center gap-3" onSubmit={event => { event.preventDefault(); setQuery(search.trim()) }}>
        <label className="min-w-0 flex-1 text-sm"><span className="sr-only">搜索应用、企业或 clientId</span><input className="min-h-11 w-full rounded-md border bg-background px-3 text-sm" aria-label="搜索应用、企业或 clientId" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索应用、企业或 clientId" /></label>
        <Button className="min-h-11" variant="outline" type="submit">搜索</Button><Button className="min-h-11" variant="ghost" type="button" disabled={management.isFetching} onClick={() => void management.refetch()}><RefreshCw className={management.isFetching ? 'animate-spin motion-reduce:animate-none' : ''} />刷新</Button>
      </form>
      {management.isPending && <p role="status" className="text-sm">正在读取本实例的授权…</p>}
      {management.isError && <div role="alert" className="space-y-2 text-sm"><p>授权读取失败：{management.error.message}</p><p className="text-xs text-muted-foreground">请确认后端已加载包含管理页面 API 的版本，并检查管理员登录状态。</p><Button variant="outline" className="min-h-11" onClick={() => void management.refetch()}>重新读取</Button></div>}
      {management.data && <>
        {!management.data.clients.length && <p className="border-y py-8 text-sm text-muted-foreground">{query ? '没有匹配的授权，可调整搜索条件。' : '尚未颁发应用凭据。可先为 yoooni-agent 创建测试授权，项目范围留空即可分析调用方资料。'}</p>}
        <ul aria-label="应用授权列表" className="divide-y border-t">{management.data.clients.map(grant => <li key={grant.clientId} className="space-y-3 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 space-y-1"><h2 className="break-all text-sm font-semibold">{grant.appId}</h2><p className="break-all text-xs text-muted-foreground">企业 {grant.tenantId}</p></div><span className={`text-xs ${grant.status === 'ACTIVE' ? 'text-foreground' : 'text-muted-foreground'}`}>{({ ACTIVE: '有效', EXPIRED: '已过期', REVOKED: '已撤销' })[grant.status]} · v{grant.version}</span></div>
          <p className="break-all font-mono text-xs text-muted-foreground">{grant.clientId}</p>
          <p className="break-words text-xs leading-6 text-muted-foreground">项目范围：{grant.projectIds.length ? grant.projectIds.map(id => management.data!.projects.find(project => project.id === id)?.name ?? id).join('、') : '仅调用方资料，无源码授权'}</p>
          <p className="text-xs leading-6 text-muted-foreground">到期 {new Date(grant.expiresAt).toLocaleString()}<br />最近变更 {new Date(grant.changedAt).toLocaleString()} · 操作人 ID {grant.changedBy}</p>
          {grant.status !== 'REVOKED' && <div className="flex flex-wrap gap-3"><Button className="min-h-11" variant="outline" onClick={event => begin({ type: 'rotate', grant }, event.currentTarget)}><KeyRound />轮换 / 续期</Button><Button className="min-h-11" variant="ghost" onClick={event => begin({ type: 'revoke', grant }, event.currentTarget)}>撤销授权</Button></div>}
        </li>)}</ul>
        {management.data.truncated && <p role="status" className="text-sm text-muted-foreground">当前只显示前 200 条，请缩小搜索范围。</p>}
        <p className="pb-4 text-xs leading-6 text-muted-foreground">密钥只在颁发或轮换成功后展示一次，列表无法找回明文。轮换保留原任务归属；撤销后重新创建的凭据不会继承旧任务。</p>
      </>}
    </div>
    {action && management.data && <ConsultBackendGrantSheet owner={owner} action={action} projects={management.data.projects} trigger={trigger.current} onClose={() => setAction(null)} onChanged={() => { void management.refetch() }} />}
  </main>
}
