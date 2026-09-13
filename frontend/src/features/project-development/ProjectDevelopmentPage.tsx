import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAccessContext } from '@/shell/permission'
import { developmentLocation } from './navigation'
import { workbenches } from './workbenches'

const NewDevModulePage = lazy(() => import('@/features/new-devmodule/public-api').then(module => ({ default: module.NewDevModulePage })))

export function ProjectDevelopmentPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const access = useAccessContext()
  const allowed = (permission: string) => access.superAdmin || access.roles.includes('ADMIN') || access.permissionCodes.includes(permission)
  const available = workbenches.filter(item => allowed(item.permission))
  const query = new URLSearchParams(location.search)
  const requested = query.get('system')
  const selected = requested && requested !== 'new' ? available.find(item => item.id === requested)?.id : available[0]?.id
  const adding = query.get('action') === 'new' || requested === 'new'
  const canAdd = allowed('menu:new-devmodule')
  const [visited, setVisited] = useState<string[]>([])
  const [addVisited, setAddVisited] = useState(adding)
  useEffect(() => {
    if (selected && !adding) setVisited(previous => previous.includes(selected) ? previous : [...previous, selected])
    if (adding) setAddVisited(true)
  }, [selected, adding])
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  const select = (id: string) => {
    if (selected) setVisited(previous => previous.includes(selected) ? previous : [...previous, selected])
    navigate({ ...developmentLocation(location.search, id), hash: location.hash })
    tabRefs.current.get(id)?.focus()
  }
  return <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-lg font-semibold">项目开发</h1>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">服务、日志与开发配置，按系统集中管理。</p></div>
      {canAdd && !adding && <Button variant="outline" size="sm" onClick={() => {
        if (selected) setVisited(previous => previous.includes(selected) ? previous : [...previous, selected])
        navigate({ ...developmentLocation(location.search, selected ?? 'new', true), hash: location.hash })
      }}><Plus className="size-4" />新增模块</Button>}
      {adding && selected && <Button variant="outline" size="sm" onClick={() => select(selected)}><ArrowLeft className="size-4" />返回工作台</Button>}
    </header>
    <div role="tablist" aria-label="开发系统" className="mb-5 flex max-w-full gap-5 overflow-x-auto border-b">
      {available.map((item, index) => <button key={item.id} ref={node => { if (node) tabRefs.current.set(item.id, node); else tabRefs.current.delete(item.id) }}
        id={`dev-tab-${item.id}`} role="tab" type="button" aria-selected={!adding && selected === item.id}
        aria-controls={`dev-panel-${item.id}`} tabIndex={selected === item.id || (!selected && index === 0) ? 0 : -1}
        onClick={() => select(item.id)} onKeyDown={event => {
          const nextIndex = event.key === 'ArrowRight' ? (index + 1) % available.length : event.key === 'ArrowLeft' ? (index - 1 + available.length) % available.length : event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : null
          if (nextIndex === null) return
          event.preventDefault()
          const next = available[nextIndex].id
          select(next)
          tabRefs.current.get(next)?.focus()
        }}
        className={`shrink-0 border-b-2 px-1 pb-3 text-sm focus-visible:outline focus-visible:outline-2 ${!adding && selected === item.id ? 'border-[var(--color-primary)] font-medium' : 'border-transparent text-[var(--color-muted-foreground)]'}`}>{item.name}</button>)}
    </div>
    {(addVisited || adding) && canAdd && <section hidden={!adding} aria-label="新增模块">
      <Suspense fallback={<p role="status">正在加载新增模块…</p>}><NewDevModulePage embedded /></Suspense>
    </section>}
    {adding && !canAdd && <p role="alert">没有新增模块权限，请选择已授权的系统页签。</p>}
    {available.map(item => {
      if ((item.id !== selected || adding) && !visited.includes(item.id)) return null
      const Page = item.component
      return <section key={item.id} id={`dev-panel-${item.id}`} role="tabpanel" aria-labelledby={`dev-tab-${item.id}`} hidden={adding || selected !== item.id}>
        <Suspense fallback={<p role="status">正在加载 {item.name} 工作台…</p>}><Page embedded /></Suspense>
      </section>
    })}
    {!selected && !adding && <p role="status">{available.length ? '该系统未登记或无权访问，请选择上方已授权的系统页签。' : '尚未获得系统开发权限，请联系管理员分配对应系统权限。'}</p>}
  </div>
}
