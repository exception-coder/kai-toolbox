import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listWorkspaces } from '@/features/claude-chat/public-api'
import { listProjects, ProjectCard, type ProjectInfo } from '@/features/projects/public-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RegistryError } from './RegistryStates'
import type { RegistryProject } from './types'

export interface DiscoveredProject { name: string; path: string; details?: ProjectInfo }
export const projectPathKey = (path: string) => {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[A-Za-z]:|^\/\//.test(normalized) ? normalized.toLowerCase() : normalized
}

export function mergeDiscoveredProjects(workspaces: DiscoveredProject[], projects: ProjectInfo[]): DiscoveredProject[] {
  const merged = new Map(projects.map(project => [projectPathKey(project.path), { name: project.name, path: project.path, details: project } as DiscoveredProject]))
  workspaces.forEach(project => merged.set(projectPathKey(project.path), { ...merged.get(projectPathKey(project.path)), ...project }))
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function LocalProjectDiscovery({ registered, onSelect, onOpen, onSettings }: {
  registered: RegistryProject[]; onSelect: (project: DiscoveredProject) => void; onOpen: (id: string) => void; onSettings: () => void
}) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const workspaces = useQuery({ queryKey: ['claude-chat-workspaces'], queryFn: listWorkspaces, refetchInterval: 5000 })
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects, refetchInterval: 5000 })
  const choices = mergeDiscoveredProjects(workspaces.data?.roots.flatMap(root => root.dirs.map(dir => ({ name: dir.alias || dir.name, path: dir.path }))) ?? [], projects.data?.items ?? [])
  const visible = choices.filter(project => `${project.name} ${project.path}`.toLowerCase().includes(search.trim().toLowerCase()))
  const registeredByPath = new Map(registered.map(project => [projectPathKey(project.metadata.localPath), project.id]))
  return <section className="space-y-5" aria-label="本地项目">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">本地项目</h2><p className="mt-1 text-sm text-[var(--color-muted-foreground)]">搜索代码目录，接入项目库。已登记项目直接进入系统画像。</p></div>
      <div className="flex gap-2"><Button size="sm" variant="ghost" disabled={workspaces.isFetching || projects.isFetching} onClick={() => { void workspaces.refetch(); void projects.refetch() }}>刷新目录</Button><Button size="sm" variant="outline" onClick={onSettings}>管理目录</Button></div></div>
    <Input aria-label="搜索本地项目" placeholder="搜索项目名称或完整路径" value={search} onChange={event => setSearch(event.target.value)} />
    <RegistryError error={workspaces.error} retry={() => void workspaces.refetch()} /><RegistryError error={projects.error} retry={() => void projects.refetch()} />
    {workspaces.data?.roots.filter(root => !root.exists).map(root => <p key={root.root} className="break-all text-sm">目录不可用：{root.root}。请在目录设置中修正。</p>)}
    {projects.data && !projects.data.rootExists && <p className="break-all text-sm">默认项目目录不可用：{projects.data.root}。请在目录设置中修正。</p>}
    {(workspaces.isLoading || projects.isLoading) && <p role="status" className="text-sm">正在发现项目…</p>}
    {!workspaces.isLoading && !projects.isLoading && !visible.length && <div className="space-y-3 py-4"><p className="text-sm">{search ? '没有匹配的目录，请调整搜索。' : '暂未发现项目。配置扫描目录，或使用右上角登记项目填写代码路径。'}</p><Button variant="outline" onClick={onSettings}>设置扫描目录</Button></div>}
    <div className="max-h-[32rem] overflow-y-auto divide-y divide-[var(--color-border)]">{visible.map(project => {
      const id = registeredByPath.get(projectPathKey(project.path))
      return <div key={project.path} className="py-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="text-sm font-medium">{project.name}</h3><p className="mt-1 break-all text-xs text-[var(--color-muted-foreground)]">{project.path}</p></div>
        <div className="flex gap-2">{project.details && <Button variant="ghost" size="sm" onClick={() => setExpanded(expanded === project.path ? null : project.path)} aria-expanded={expanded === project.path}>本地操作</Button>}
          <Button variant={id ? 'ghost' : 'outline'} size="sm" onClick={() => id ? onOpen(id) : onSelect(project)}>{id ? '打开已登记项目' : '接入项目库'}</Button></div></div>
        {expanded === project.path && project.details && <div className="mt-3 max-w-lg"><ProjectCard project={project.details} /></div>}
      </div>
    })}</div>
  </section>
}
