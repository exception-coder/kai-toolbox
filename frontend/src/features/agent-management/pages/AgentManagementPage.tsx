import { lazy, Suspense } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AgentRegistryView } from './AgentRegistryView'
import { AGENT_MANAGEMENT_PATH } from '../navigation'

const EvalPage = lazy(() => import('../evaluation/pages/EvalPage').then(module => ({ default: module.EvalPage })))

export function AgentManagementPage() {
  const [params] = useSearchParams()
  const evaluation = params.get('section') === 'evaluation'
  const viewHref = (section: string) => {
    const next = new URLSearchParams(params)
    if (section === 'evaluation') next.set('section', section)
    else next.delete('section')
    return `${AGENT_MANAGEMENT_PATH}?${next}`
  }
  return (
    <main className="flex h-full min-h-0 flex-col overflow-y-auto bg-[var(--color-background)] text-[var(--color-foreground)] lg:overflow-hidden">
      <header className="shrink-0 border-b px-6 pt-5 lg:px-10">
        <h1 className="text-2xl font-semibold tracking-tight">Agent 管理</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          集中管理 Agent、能力配置、回归评测与版本发布。
        </p>
        <nav aria-label="Agent 管理工作台" className="mt-5 flex gap-6">
          {([['agents', 'Agent 列表'], ['evaluation', '评测中心']] as const).map(([section, label]) => {
            const active = evaluation === (section === 'evaluation')
            return <Link key={section} to={viewHref(section)} aria-current={active ? 'page' : undefined}
              className={`border-b-2 py-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${active
                ? 'border-[var(--color-foreground)] font-medium'
                : 'border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'}`}>
              {label}
            </Link>
          })}
        </nav>
      </header>
      <div hidden={evaluation} className="min-h-0 flex-1 lg:overflow-hidden"><AgentRegistryView key={params.get('agent') || 'business-consult'} /></div>
      {evaluation && <Suspense fallback={<p role="status" className="px-6 py-8 lg:px-10">正在加载评测中心…</p>}>
        <div className="min-h-0 flex-1 overflow-y-auto"><EvalPage /></div>
      </Suspense>}
    </main>
  )
}
