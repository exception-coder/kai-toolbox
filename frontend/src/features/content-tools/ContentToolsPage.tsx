import { Suspense, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAccessContext } from '@/shell/permission'
import { cn } from '@/lib/utils'
import { contentToolLocation } from './navigation'
import { contentTools } from './tools'

export function ContentToolsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const access = useAccessContext()
  const allAllowed = access.superAdmin || access.roles.includes('ADMIN') || access.permissionCodes.includes('menu:content-tools')
  const available = contentTools.filter(tool => allAllowed || access.permissionCodes.includes(`menu:${tool.id}`))
  const requested = new URLSearchParams(location.search).get('tool')
  const selected = available.find(tool => tool.id === requested)?.id ?? available[0]?.id
  const [visited, setVisited] = useState<string[]>([])
  useEffect(() => {
    if (selected) setVisited(previous => previous.includes(selected) ? previous : [...previous, selected])
  }, [selected])
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const select = (id: string) => {
    if (selected) setVisited(previous => previous.includes(selected) ? previous : [...previous, selected])
    navigate({ ...contentToolLocation(location.search, id), hash: location.hash })
    refs.current.get(id)?.focus()
  }
  return <div className="flex min-h-full min-w-0 flex-col gap-4 p-4 md:p-6">
    <header><h1 className="text-xl font-semibold tracking-tight">内容工具</h1>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">编辑、转换与处理内容，切换工具可继续当前输入。</p></header>
    <div role="tablist" aria-label="内容工具" className="flex shrink-0 gap-4 overflow-x-auto border-b">
      {available.map((tool, index) => <button key={tool.id} type="button" role="tab"
        ref={node => { if (node) refs.current.set(tool.id, node); else refs.current.delete(tool.id) }}
        id={`content-tab-${tool.id}`} aria-controls={`content-panel-${tool.id}`}
        aria-selected={selected === tool.id} tabIndex={selected === tool.id ? 0 : -1}
        onClick={() => select(tool.id)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % available.length : event.key === 'ArrowLeft' ? (index - 1 + available.length) % available.length : event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : null
          if (next === null) return
          event.preventDefault()
          select(available[next].id)
        }} className={cn('shrink-0 border-b-2 px-1 py-3 text-sm transition-colors hover:text-[var(--color-foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]', selected === tool.id ? 'border-[var(--color-primary)] font-medium' : 'border-transparent text-[var(--color-muted-foreground)]')}>
        {tool.name}
      </button>)}
    </div>
    {requested && requested !== selected && <p role="status" className="text-sm text-[var(--color-muted-foreground)]">所选工具不存在或尚未授权，请选择可用工具。</p>}
    {!selected && <div className="space-y-3"><p role="status">尚未获得内容工具权限，请联系管理员分配所需工具。</p><Link className="text-sm underline" to="/">返回首页</Link></div>}
    {available.map(tool => {
      const Page = tool.component
      return <section key={tool.id} hidden={selected !== tool.id} id={`content-panel-${tool.id}`}
        role="tabpanel" aria-labelledby={`content-tab-${tool.id}`} className="min-w-0 flex-1">
        {(selected === tool.id || visited.includes(tool.id)) && <Suspense fallback={<p role="status">正在加载{tool.name}…</p>}>
          <Page embedded active={selected === tool.id} />
        </Suspense>}
      </section>
    })}
  </div>
}
