import { useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowUp, GitBranch, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RegistryError } from '../registry/RegistryStates'
import type { RegistryProject } from '../registry/types'
import { getGitWorkspace, pushGitWorkspace } from './api'
import { GitWorkspaceChanges } from './GitWorkspaceChanges'

export function ProjectGitWorkspace({ project, onBusyChange }: { project: RegistryProject; onBusyChange?: (busy: boolean) => void }) {
  const workspace = useQuery({ queryKey: ['project-git-workspace', project.id], queryFn: () => getGitWorkspace(project.id), retry: false })
  const push = useMutation({ mutationFn: (token: string) => pushGitWorkspace(project.id, token),
    onSuccess: () => { void workspace.refetch() }, onError: () => { void workspace.refetch() } })
  useEffect(() => { onBusyChange?.(push.isPending) }, [push.isPending, onBusyChange])
  const data = workspace.data
  const destinations = data?.destinations ?? []
  return <section className="min-w-0 space-y-6" aria-label={`${project.metadata.name} Git 工作区`}>
    <header className="flex justify-end">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={workspace.isFetching || push.isPending} onClick={() => { push.reset(); void workspace.refetch() }}><RefreshCw className="size-4" />刷新</Button>
        <Button size="sm" disabled={!data || !!data.pushBlockedReason || workspace.isFetching || workspace.isError || push.isPending}
          onClick={() => data && push.mutate(data.token)}><ArrowUp className="size-4" />{push.isPending ? '正在推送…' : 'Push 当前分支'}</Button>
      </div>
    </header>
    <RegistryError error={workspace.error} retry={() => void workspace.refetch()} />
    <RegistryError error={push.error} />
    {push.isSuccess && <p role="status" className="text-sm text-[var(--color-success)]">{push.data.message}。{workspace.isError ? '状态刷新失败，请重试读取。' : ''}</p>}
    {push.isPending && <p role="status" className="text-sm">正在推送到 {data?.remote}/{data?.targetBranch}，请等待结果…</p>}
    {workspace.isLoading && <p role="status" className="py-8 text-sm text-[var(--color-muted-foreground)]">正在读取 Git 工作区…</p>}
    {data && <>
      <div className="space-y-4 border-y border-[var(--color-border)] py-5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"><span className="inline-flex items-center gap-2 font-medium"><GitBranch className="size-4" />{data.branch || 'detached HEAD'}</span><code className="text-xs" title={data.head}>HEAD {data.head ? data.head.slice(0, 8) : '尚无提交'}</code></div>
        <dl className="grid gap-4 text-sm sm:grid-cols-3"><div><dt className="text-xs text-[var(--color-muted-foreground)]">上游 / 推送目标</dt><dd className="mt-1 break-all">{data.remote ? `${data.remote}/${data.targetBranch}` : '未配置'}</dd></div><div><dt className="text-xs text-[var(--color-muted-foreground)]">待推送</dt><dd className="mt-1 tabular-nums">{data.ahead ?? '—'} 条提交</dd></div><div><dt className="text-xs text-[var(--color-muted-foreground)]">落后上游</dt><dd className="mt-1 tabular-nums">{data.behind ?? '—'} 条提交</dd></div></dl>
        <p className="text-xs text-[var(--color-muted-foreground)]">基于本地远端记录，未主动拉取远端。读取于 {new Date(workspace.dataUpdatedAt).toLocaleTimeString()}。</p>
        {destinations.length > 0 && <div className="space-y-1 text-xs text-[var(--color-muted-foreground)]"><p>Push 将发送到以下 {destinations.length} 个已配置地址：</p>{destinations.map((destination, index) => <p key={`${index}-${destination}`} className="break-all">{index + 1}. {destination}</p>)}</div>}
      </div>
      {data.pushBlockedReason && <p className="text-sm text-[var(--color-muted-foreground)]">{data.pushBlockedReason}</p>}
      <GitWorkspaceChanges workspace={data} />
    </>}
  </section>
}
