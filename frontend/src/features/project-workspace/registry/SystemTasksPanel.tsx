import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowUpRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CHAT_ROUTE, useChatRuntime } from '@/features/claude-chat/public-api/runtime'
import { navigateWithLaunchIntent } from '@/shell/launch-intent/api'
import { createSystemTask, getTaskContext } from './api'
import { RegistryError } from './RegistryStates'
import type { ProjectDetail, SystemTask } from './types'

export function SystemTasksPanel({ detail }: { detail: ProjectDetail }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ title: '', description: '', domainId: '', context: '' })
  const cache = useQueryClient()
  const navigate = useNavigate()
  const { activate } = useChatRuntime()
  const create = useMutation({ mutationFn: () => createSystemTask(detail.project.id, draft), onSuccess: async () => {
    setAdding(false); setDraft({ title: '', description: '', domainId: '', context: '' })
    await cache.invalidateQueries({ queryKey: ['registry-project', detail.project.id] })
  } })
  const launch = useMutation({ mutationFn: async (task: SystemTask) => {
    const { prompt } = await getTaskContext(detail.project.id, task.id)
    activate()
    await navigateWithLaunchIntent(navigate, CHAT_ROUTE, { type: 'CHAT_OPEN_DRAFT', cwd: detail.project.metadata.localPath, seed: prompt })
  } })
  return <section className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">系统任务</h2>
      <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">任务进入需求池，绑定 {detail.project.metadata.name} 的画像上下文，无需选择代码模块。</p></div>
      <Button size="sm" onClick={() => setAdding(true)}><Plus className="size-4" />新建任务</Button></div>
    {adding && <form className="max-w-3xl space-y-4 border-y border-[var(--color-border)] py-6" onSubmit={event => { event.preventDefault(); create.mutate() }}>
      <label className="block space-y-2 text-sm"><span>任务标题 *</span><Input required maxLength={200} value={draft.title} onChange={event => setDraft(old => ({ ...old, title: event.target.value }))} /></label>
      <label className="block space-y-2 text-sm"><span>描述 *</span><textarea required rows={4} maxLength={20000} className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-3" value={draft.description} onChange={event => setDraft(old => ({ ...old, description: event.target.value }))} /></label>
      <label className="block space-y-2 text-sm"><span>业务域（可选）</span><Input maxLength={120} value={draft.domainId} onChange={event => setDraft(old => ({ ...old, domainId: event.target.value }))} placeholder="尚不确定可留空，后续由 Agent 定位" /></label>
      <label className="block space-y-2 text-sm"><span>补充上下文（可选）</span><Input maxLength={10000} value={draft.context} onChange={event => setDraft(old => ({ ...old, context: event.target.value }))} /></label>
      {!detail.profile && <p className="text-xs text-[var(--color-muted-foreground)]">该系统尚未初始化。任务会保存，开发前需先补齐系统画像。</p>}
      <RegistryError error={create.error} /><div className="flex gap-2"><Button type="submit" disabled={create.isPending}>{create.isPending ? '正在创建…' : '创建任务'}</Button><Button type="button" variant="ghost" onClick={() => setAdding(false)} disabled={create.isPending}>取消</Button></div>
    </form>}
    <RegistryError error={launch.error} />
    {detail.tasks.length === 0 ? <p className="py-6 text-sm text-[var(--color-muted-foreground)]">该系统暂无任务。新建任务后，Agent 将获得系统身份、规则与证据入口。</p>
      : <div className="divide-y divide-[var(--color-border)]">{detail.tasks.map(task => <article key={task.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
        <div className="min-w-0 flex-1"><h3 className="text-sm font-medium">{task.title}</h3><p className="mt-2 line-clamp-2 text-sm text-[var(--color-muted-foreground)]">{task.description}</p><p className="mt-2 text-xs text-[var(--color-muted-foreground)]">{task.profileVersion ? `画像 v${task.profileVersion}` : '未绑定初始化画像'} · {new Date(task.createdAt).toLocaleDateString()}</p></div>
        <Button size="sm" variant="outline" onClick={() => launch.mutate(task)} disabled={launch.isPending}>交给 Agent <ArrowUpRight className="size-3" /></Button>
      </article>)}</div>}
    <Link className="inline-flex items-center gap-1 text-sm underline underline-offset-4" to="/tools/reqpool">在需求池跟进任务 <ArrowUpRight className="size-3" /></Link>
  </section>
}
