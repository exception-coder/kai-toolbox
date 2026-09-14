import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listProjectCatalog } from './projectCatalogApi'
import { listProjects, ProjectCard, type ProjectInfo } from '@/features/projects/public-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RegistryError } from './RegistryStates'
import type { RegistryProject } from './types'
import { projectPathKey } from '../lib/projectScope'
export { projectPathKey } from '../lib/projectScope'

export interface DiscoveredProject { name: string; path: string; details?: ProjectInfo }

export function LocalProjectDiscovery({ registered, onSelect, onOpen, onSettings }: {
  registered: RegistryProject[]; onSelect: (project: DiscoveredProject) => void; onOpen: (id: string) => void; onSettings: () => void
}) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const projects = useQuery({ queryKey: ['project-catalog'], queryFn: () => listProjectCatalog(), refetchInterval: 5000 })
  const choices: DiscoveredProject[] = (projects.data ?? []).filter(project => project.available).map(project => ({ name: project.name, path: project.path }))
  const visible = choices.filter(project => `${project.name} ${project.path}`.toLowerCase().includes(search.trim().toLowerCase()))
  const registeredByPath = new Map(registered.map(project => [projectPathKey(project.metadata.localPath), project.id]))
  return <section className="space-y-5" aria-label="本地项目">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">本地项目</h2><p className="mt-1 text-sm text-[var(--color-muted-foreground)]">搜索代码目录，接入项目库。已登记项目直接进入 AI 工作区。</p></div>
      <div className="flex gap-2"><Button size="sm" variant="ghost" disabled={projects.isFetching} onClick={() => { void projects.refetch() }}>刷新目录</Button><Button size="sm" variant="outline" onClick={onSettings}>管理目录</Button></div></div>
    <Input aria-label="搜索本地项目" placeholder="搜索项目名称或完整路径" value={search} onChange={event => setSearch(event.target.value)} />
    <RegistryError error={projects.error} retry={() => void projects.refetch()} />
    {projects.isLoading && <p role="status" className="text-sm">正在发现项目…</p>}
    {!projects.isLoading && !projects.isError && !visible.length && <div className="space-y-3 py-4"><p className="text-sm">{search ? '没有匹配的目录，请调整搜索。' : '暂未发现可用项目。请检查目录设置及全局排除范围。'}</p><Button variant="outline" onClick={onSettings}>设置扫描目录</Button></div>}
    <div className="max-h-[32rem] overflow-y-auto divide-y divide-[var(--color-border)]">{visible.map(project => {
      const id = registeredByPath.get(projectPathKey(project.path))
      return <div key={project.path} className="py-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="text-sm font-medium">{project.name}</h3><p className="mt-1 break-all text-xs text-[var(--color-muted-foreground)]">{project.path}</p></div>
        <div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => setExpanded(expanded === project.path ? null : project.path)} aria-expanded={expanded === project.path}>本地操作</Button>
          <Button variant={id ? 'ghost' : 'outline'} size="sm" onClick={() => id ? onOpen(id) : onSelect(project)}>{id ? '打开已登记项目' : '接入项目库'}</Button></div></div>
        {expanded === project.path && <LocalProjectActions path={project.path} />}
      </div>
    })}</div>
  </section>
}

/** 本地类型与 Git 信息按需补充，不再作为另一份发现清单合并。 */
function LocalProjectActions({ path }: { path: string }) {
  const query = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const project = query.data?.items.find(item => projectPathKey(item.path) === projectPathKey(path))
  return <div className="mt-3 max-w-lg"><RegistryError error={query.error} retry={() => void query.refetch()} />
    {query.isLoading && <p role="status" className="text-sm">正在读取本地操作…</p>}
    {project && <ProjectCard project={project} />}
    {query.isSuccess && !project && <p className="text-sm">目录已不可用或已排除，请刷新清单。</p>}
  </div>
}
