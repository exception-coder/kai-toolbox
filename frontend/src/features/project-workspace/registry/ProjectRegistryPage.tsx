import { lazy, Suspense, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowUpRight, Plus, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listRegistry } from './api'
import { ReadinessLabel, RegistryError } from './RegistryStates'
import { ProjectRegistrationForm } from './ProjectRegistrationForm'
import type { Readiness } from './types'
import { LocalProjectDiscovery, type DiscoveredProject } from './LocalProjectDiscovery'
import { ProjectDirectorySettings } from './ProjectDirectorySettings'

const ModuleWorkspace = lazy(() => import('../pages/ProjectWorkspacePage').then(module => ({ default: module.ProjectWorkspacePage })))
const sections = [['systems', '已登记系统'], ['local', '本地项目'], ['directories', '目录设置'], ['modules', '模块工作区']] as const

export function ProjectRegistryPage() {
  const navigate = useNavigate()
  const cache = useQueryClient()
  const [registering, setRegistering] = useState(false)
  const [selection, setSelection] = useState<DiscoveredProject | null>(null)
  const [params, setParams] = useSearchParams()
  const section = sections.some(([id]) => id === params.get('section')) ? params.get('section') : 'systems'
  const showSection = (value: string) => setParams({ section: value })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'ALL' | 'READY' | 'ACTION'>('ALL')
  const projects = useQuery({ queryKey: ['project-registry'], queryFn: listRegistry, refetchInterval: 10000 })
  const all = projects.data ?? []
  const ready = all.filter(project => project.state === 'AI_READY').length
  const visible = all.filter(project => {
    const matches = `${project.metadata.name} ${project.metadata.localPath} ${project.metadata.owner}`.toLowerCase().includes(search.toLowerCase())
    return matches && (filter === 'ALL' || (filter === 'READY' ? project.state === 'AI_READY' : project.state !== 'AI_READY'))
  })
  return <main className="mx-auto w-full max-w-7xl space-y-8 px-6 py-8 md:px-12">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-2 text-xs tracking-widest text-[var(--color-muted-foreground)]">FORGE / PROJECT REGISTRY</p>
        <h1 className="text-2xl font-semibold tracking-tight">项目库</h1>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">接入系统、建立 AI 上下文，让每个任务从理解项目开始。</p>
      </div>
      <div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={() => void projects.refetch()} disabled={projects.isFetching} aria-label="刷新项目库"><RefreshCw className="size-4" /></Button>
        <Button onClick={() => { setSelection(null); setRegistering(value => !value) }}><Plus className="size-4" />登记项目</Button></div>
    </header>
    <nav aria-label="项目库区域" className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)] pb-3">{sections.map(([id, label]) => <Button key={id} size="sm" className="shrink-0" variant={section === id ? 'secondary' : 'ghost'} aria-current={section === id ? 'page' : undefined} onClick={() => showSection(id)}>{label}</Button>)}</nav>
    {registering && <section className="border-y border-[var(--color-border)] py-6"><div className="mb-6 flex flex-wrap items-center gap-4"><h2 className="text-base font-semibold">接入一个系统</h2><Button variant="ghost" size="sm" onClick={() => { setRegistering(false); showSection('local') }}>从本地项目选择</Button></div>
      <ProjectRegistrationForm key={selection?.path ?? 'manual'} initial={selection ? { name: selection.name, localPath: selection.path } : undefined} onCancel={() => setRegistering(false)} onSaved={project => { void cache.invalidateQueries({ queryKey: ['project-registry'] }); navigate(`/tools/project-workspace/${project.id}`) }} />
    </section>}
    {section === 'local' && <LocalProjectDiscovery registered={all} onSelect={project => { setSelection(project); setRegistering(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }} onOpen={id => navigate(`/tools/project-workspace/${id}`)} onSettings={() => showSection('directories')} />}
    {section === 'directories' && <ProjectDirectorySettings />}
    {section === 'modules' && <Suspense fallback={<p role="status">正在读取模块工作区…</p>}><ModuleWorkspace onOpenDirectorySettings={() => showSection('directories')} /></Suspense>}
    {section === 'systems' && <>
    <section className="flex flex-wrap gap-x-12 gap-y-4 border-b border-[var(--color-border)] pb-6" aria-label="项目概况">
      <Metric value={all.length} label="已登记系统" /><Metric value={ready} label="AI Ready" /><Metric value={all.length - ready} label="需要关注" />
    </section>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex gap-1" aria-label="项目状态筛选">{([['ALL', '全部系统'], ['READY', 'AI Ready'], ['ACTION', '需要关注']] as const).map(([value, label]) =>
        <Button key={value} size="sm" variant={filter === value ? 'secondary' : 'ghost'} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</Button>)}</div>
      <label className="relative w-full sm:w-72"><Search className="absolute left-3 top-3 size-4 text-[var(--color-muted-foreground)]" /><Input aria-label="搜索项目" placeholder="搜索系统、团队或路径" className="pl-9" value={search} onChange={event => setSearch(event.target.value)} /></label>
    </div>
    <RegistryError error={projects.error} retry={() => void projects.refetch()} />
    {projects.isLoading ? <p role="status" className="py-12 text-sm text-[var(--color-muted-foreground)]">正在读取项目库…</p>
      : !projects.isError && visible.length === 0 ? <section className="space-y-3 py-8"><h2 className="font-medium">{all.length ? '没有匹配的系统' : '从登记第一个系统开始'}</h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">{all.length ? '调整搜索或筛选条件，继续查看项目。' : '选择本机代码目录，登记系统身份，再执行 Full Init 建立画像。'}</p>
        <Button variant="outline" onClick={() => { if (all.length) { setSearch(''); setFilter('ALL') } else setRegistering(true) }}>{all.length ? '清除筛选' : '登记项目'}</Button></section>
      : <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">{visible.map(project => <Link key={project.id}
        to={`/tools/project-workspace/${project.id}`} className="group grid gap-4 py-6 transition-colors hover:bg-[var(--color-muted)]/30 focus-visible:outline-2 focus-visible:outline-[var(--color-ring)] md:grid-cols-[minmax(0,1fr)_180px_160px] md:items-center">
        <div className="min-w-0"><div className="flex items-center gap-3"><h2 className="text-base font-semibold">{project.metadata.name}</h2><ArrowUpRight className="size-4 text-[var(--color-muted-foreground)]" /></div>
          <p className="mt-2 truncate text-xs text-[var(--color-muted-foreground)]" title={project.metadata.localPath}>{project.metadata.localPath}</p>
          <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">{project.metadata.repoType.toUpperCase()} {project.metadata.owner && ` · ${project.metadata.owner}`}</p></div>
        <ReadinessLabel state={project.state as Readiness} />
        <div className="text-xs text-[var(--color-muted-foreground)]"><p>{project.profileVersion ? `System Profile v${project.profileVersion}` : '尚未建立画像'}</p><p className="mt-2">{new Date(project.updatedAt).toLocaleString()}</p></div>
      </Link>)}</div>}
    </>}
    <footer className="text-xs text-[var(--color-muted-foreground)]">登记 → 初始化 → 系统画像 → 任务 → 验证 → 同步</footer>
  </main>
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div><p className="text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{label}</p></div>
}
