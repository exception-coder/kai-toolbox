import { Suspense, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAccessContext } from '@/shell/permission'
import { localToolLocation } from './navigation'
import { LocalToolTabs } from './LocalToolTabs'
import { localTools } from './tools'

export function LocalToolsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const access = useAccessContext()
  const available = localTools.filter(tool => access.superAdmin || access.roles.includes('ADMIN') || access.permissionCodes.includes(`menu:${tool.id}`))
  const requested = new URLSearchParams(location.search).get('tool')
  const selected = requested === null ? available[0]?.id : available.find(tool => tool.id === requested)?.id
  const [visited, setVisited] = useState<string[]>([])
  useEffect(() => {
    if (selected) setVisited(previous => previous.includes(selected) ? previous : [...previous, selected])
  }, [selected])
  const select = (id: string) => navigate({ ...localToolLocation(location.search, id), hash: location.hash })

  return <div className="flex h-full min-h-0 min-w-0 flex-col">
    <header className="shrink-0 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
      <h1 className="text-2xl font-semibold tracking-tight">本机工具</h1>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">文件整理、端口查询与本机远程访问。</p>
    </header>
    <LocalToolTabs tools={available} selected={selected} onSelect={select} />
    {available.map(tool => {
      const Page = tool.component
      const active = tool.id === selected
      return <section key={tool.id} id={`local-panel-${tool.id}`} role="tabpanel" aria-labelledby={`local-tab-${tool.id}`}
        hidden={!active} tabIndex={0} className="min-h-0 min-w-0 flex-1 overflow-auto focus-visible:outline focus-visible:outline-2">
        {(active || visited.includes(tool.id)) && <Suspense fallback={<p role="status" className="p-6">正在加载{tool.name}…</p>}>
          <Page embedded />
        </Suspense>}
      </section>
    })}
    {!selected && <div className="space-y-3 p-6" role="status">
      <p>{available.length ? '该工具不存在或无权访问，请选择上方可用页签。' : '尚未获得本机工具权限，请联系管理员分配对应工具权限。'}</p>
      <Link to="/" className="text-sm underline underline-offset-4">返回首页</Link>
    </div>}
  </div>
}
