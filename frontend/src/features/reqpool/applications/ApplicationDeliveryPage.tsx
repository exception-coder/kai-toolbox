import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { usePermission } from '@/shell/permission'
import { listRegistry } from '@/features/project-workspace/public-api'
import { ApplicationTaskBoard, getOpenSpecBoards } from '@/features/openspec-board/public-api'
import { applicationWorkspaces } from './applicationModel'

export function DeliveryHome() {
  const location = useLocation()
  const query = new URLSearchParams(location.search)
  if (query.has('project') || query.has('q')) return <Navigate replace to={`/tools/reqpool/requirements${location.search}${location.hash}`} />
  return <ApplicationDeliveryPage />
}

export function ApplicationDeliveryPage() {
  const client = useQueryClient()
  const { systemId } = useParams()
  const allowed = usePermission('menu:openspec-board')
  const registry = useQuery({ queryKey: ['project-registry'], queryFn: listRegistry })
  const boards = useQuery({ queryKey: ['openspec-boards', 0], queryFn: () => getOpenSpecBoards(), enabled: allowed, staleTime: 15_000 })
  const entries = applicationWorkspaces(registry.data ?? [], boards.data?.projects ?? [])
  const selected = entries.find(entry => entry.app.id === systemId)
  const refreshBoards = useMutation({ mutationFn: () => getOpenSpecBoards(true), onSuccess: data => client.setQueryData(['openspec-boards', 0], data) })
  const error = registry.error ?? boards.error ?? refreshBoards.error
  const refresh = () => { void registry.refetch(); if (allowed) refreshBoards.mutate() }
  return <main className="mx-auto max-w-[1800px] space-y-6 p-4 md:p-8">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
      <div><Link to="/tools/reqpool" className="text-xs text-muted-foreground">AI 交付中心</Link><h1 className="mt-2 text-2xl font-semibold tracking-tight">{systemId ? selected?.app.metadata.name ?? '应用详情' : 'AI 应用清单'}</h1><p className="mt-2 text-sm text-muted-foreground">{systemId ? '在当前应用中查看需求变更、任务进度和验证证据。' : '选择应用推进交付。应用身份来自项目库，需求与任务来自各应用的 OpenSpec。'}</p></div>
      <nav className="flex flex-wrap items-center gap-3 text-sm"><Link to="/tools/reqpool/requirements" className="text-primary">全部需求与交付</Link><Link to="/tools/reqpool/resources" className="text-primary">系统资源与测试账号</Link><Button variant="outline" onClick={refresh} disabled={registry.isFetching || boards.isFetching || refreshBoards.isPending}>刷新证据</Button></nav>
    </header>
    {error && <p role="alert" className="text-sm text-destructive">{error instanceof Error ? error.message : '读取失败，请刷新重试'}。暂不根据缺失数据判断任务是否完成。</p>}
    {registry.isPending ? <p role="status">正在读取应用清单…</p> : systemId ? (
      selected ? <section className="space-y-5">
        <div className="flex flex-wrap gap-4 border-b pb-3 text-sm"><Link to="/tools/reqpool">← 应用清单</Link><Link to={`/tools/project-workspace/${encodeURIComponent(systemId)}`}>项目设置与初始化</Link></div>
        {!allowed ? <p>需要需求与任务查看权限，请联系管理员。</p> : boards.isPending ? <p role="status">正在查询应用需求…</p> : selected.workspace ? <ApplicationTaskBoard key={selected.workspace.id} projectId={selected.workspace.id} /> : <AssociationGap ambiguous={selected.ambiguous} />}
      </section> : <section><h2 className="font-semibold">应用未登记或已移除</h2><Link to="/tools/reqpool" className="mt-3 inline-block text-sm text-primary">返回应用清单</Link></section>
    ) : <>
      <section className="flex flex-wrap gap-8 border-b pb-4 text-sm"><span><strong className="mr-2 text-xl">{entries.length}</strong>个应用</span><span>已关联 OpenSpec：{allowed && boards.data ? entries.filter(entry => entry.workspace).length : '待查询'}</span><span className="text-muted-foreground">任务完成状态不代表运行验收已通过</span></section>
      {!entries.length && !registry.isError ? <section className="py-8"><h2 className="font-semibold">还没有登记的 AI 应用</h2><p className="mt-2 text-sm text-muted-foreground">先在项目库登记应用和源码目录，再回来查看该应用的需求与任务。</p><Link to="/tools/project-workspace" className="mt-4 inline-block text-sm text-primary">前往项目库</Link></section> : <ul className="divide-y">{entries.map(({ app, workspace, ambiguous }) => <li key={app.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
        <div className="min-w-0"><Link to={`/tools/reqpool/apps/${encodeURIComponent(app.id)}`} className="font-semibold hover:text-primary">{app.metadata.name}</Link><p className="mt-1 break-all text-xs text-muted-foreground">{app.metadata.localPath}</p><p className="mt-2 text-sm text-muted-foreground">{!allowed ? '需要需求与任务查看权限' : boards.isFetching && !boards.data ? '正在查询需求…' : workspace ? `${workspace.changes.length} 项变更 · ${workspace.completedTasks}/${workspace.totalTasks} 项任务已完成 · 剩余 ${Math.max(0, workspace.totalTasks - workspace.completedTasks)} 项` : ambiguous ? '目录归属有歧义，请检查项目登记' : '尚未关联 OpenSpec 工作区'}</p>{workspace && workspace.state !== 'READY' && <p className="mt-1 text-xs text-muted-foreground">{workspace.message}</p>}</div>
        <Link to={`/tools/reqpool/apps/${encodeURIComponent(app.id)}`} className="text-sm text-primary">进入应用 →</Link>
      </li>)}</ul>}
      <footer className="flex flex-wrap gap-5 border-t pt-4 text-xs text-muted-foreground"><Link to="/tools/project-workspace">登记或管理应用</Link><Link to="/tools/reqpool/changes">查看尚未关联应用的工作区任务</Link></footer>
    </>}
  </main>
}

function AssociationGap({ ambiguous }: { ambiguous: boolean }) {
  return <section className="border-l-2 pl-4 py-5"><h2 className="font-semibold">{ambiguous ? '源码目录关联有歧义' : '尚未关联 OpenSpec 工作区'}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">请核对项目库源码目录与工作区目录。只有唯一匹配时才展示应用任务，不会使用同名项目或其它应用的数据。</p><div className="mt-4 flex gap-4 text-sm text-primary"><Link to="/tools/project-workspace">检查项目目录</Link><Link to="/tools/reqpool/changes">查看工作区任务</Link></div></section>
}

export function LegacyWorkspaceTasks() {
  return <main className="space-y-4 p-4 md:p-8"><Link to="/tools/reqpool" className="text-sm text-primary">← AI 应用清单</Link><p className="text-sm text-muted-foreground">此处保留工作区任务查询。登记应用并匹配源码目录后，可从应用详情查看相同需求与任务。</p><ApplicationTaskBoard /></main>
}
