import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RegistryError } from './RegistryStates'
import { listProjectCatalog, setProjectExcluded } from './projectCatalogApi'

/** 全部候选与全局使用策略，项目库是唯一管理入口。 */
export function ProjectCatalogSettings() {
  const cache = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | 'excluded'>('all')
  const query = useQuery({ queryKey: ['project-catalog', 'management'], queryFn: () => listProjectCatalog(true) })
  const mutation = useMutation({ mutationFn: ({ path, excluded }: { path: string; excluded: boolean }) => setProjectExcluded(path, excluded),
    onSuccess: async () => { await cache.invalidateQueries() } })
  const entries = (query.data ?? []).filter(item => (status === 'all' || item.excluded)
    && `${item.name} ${item.path}`.toLowerCase().includes(search.toLowerCase()))
  const roots = new Map<string, typeof entries>()
  for (const item of entries) roots.set(item.root, [...(roots.get(item.root) ?? []), item])
  return <section className="space-y-4 border-t border-[var(--color-border)] pt-6" aria-label="项目使用范围">
    <div><h2 className="font-semibold">项目使用范围</h2><p className="mt-2 text-sm text-[var(--color-muted-foreground)]">这里展示统一目录清单。排除后，其他入口和 AI 工具无法选择或加载该项目及其子目录；源码和历史记录保留，可随时恢复。</p></div>
    <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant={status === 'all' ? 'secondary' : 'ghost'} onClick={() => setStatus('all')}>全部目录</Button><Button size="sm" variant={status === 'excluded' ? 'secondary' : 'ghost'} onClick={() => setStatus('excluded')}>已排除</Button><Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>刷新清单</Button></div>
    <Input aria-label="搜索目录清单" placeholder="搜索名称或完整路径" value={search} onChange={event => setSearch(event.target.value)} />
    <RegistryError error={query.error} retry={() => void query.refetch()} />
    <RegistryError error={mutation.error} retry={() => mutation.variables && mutation.mutate(mutation.variables)} />
    {mutation.isSuccess && <p role="status" className="text-sm">项目使用范围已更新。</p>}
    {query.isLoading && <p role="status">正在读取统一目录清单…</p>}
    {!query.isLoading && !query.isError && !entries.length && <p className="text-sm">没有匹配目录，请调整筛选或在上方配置扫描目录。</p>}
    {[...roots].map(([root, projects]) => <details key={root} open className="border-b border-[var(--color-border)] pb-3">
      <summary className="cursor-pointer break-all py-2 text-sm font-medium">{root} <span className="text-xs font-normal text-[var(--color-muted-foreground)]">· {projects.length} 个项目</span></summary>
      <ul className="ml-3 border-l border-[var(--color-border)] pl-3">{projects.map(project => <li key={project.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0 flex-1"><p className="text-sm font-medium">{project.name}</p><p className="mt-1 break-all text-xs text-[var(--color-muted-foreground)]">{project.path}</p><p className="mt-1 text-xs">{project.excluded ? '已全局排除' : '允许使用'} · {project.available ? '目录可用' : '目录不可用'} · {project.systemId ? '已登记' : '未登记'}</p></div>
        <Button size="sm" variant="outline" disabled={mutation.isPending} aria-label={`${project.excluded ? '恢复' : '排除'} ${project.name}`} onClick={() => mutation.mutate({ path: project.path, excluded: !project.excluded })}>{mutation.isPending && mutation.variables?.path === project.path ? '正在保存…' : project.excluded ? '恢复使用' : '全局排除'}</Button>
      </li>)}</ul>
    </details>)}
  </section>
}
