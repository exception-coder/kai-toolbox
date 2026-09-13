import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listRegistry } from './api'
import { RegistryError } from './RegistryStates'
import { exploreTopology, getTopology } from './topologyApi'
import { TopologyResults } from './TopologyResults'

/** 显式选择参与项目，独立运行及展示跨项目证据。 */
export function TopologyKnowledgePanel({ projectId }: { projectId: string }) {
  const [selected, setSelected] = useState<string[]>([])
  const [engine, setEngine] = useState<'codex' | 'claude'>('codex')
  const [scope, setScope] = useState('')
  const cache = useQueryClient()
  const registry = useQuery({ queryKey: ['project-registry'], queryFn: listRegistry })
  const query = useQuery({ queryKey: ['project-topology', projectId], queryFn: () => getTopology(projectId),
    refetchInterval: query => query.state.data?.run?.status === 'RUNNING' ? 2000 : false, refetchOnWindowFocus: false,
  })
  const start = useMutation({ mutationFn: () => exploreTopology(projectId, { engine, scope, projectIds: [projectId, ...selected] }),
    onSuccess: run => { cache.setQueryData(['project-topology', projectId], { ...query.data, run }); void query.refetch() },
  })
  const data = query.data
  const running = start.isPending || data?.run?.status === 'RUNNING'
  const candidates = registry.data?.filter(project => project.id !== projectId) ?? []
  return <section className="space-y-6">
    <header className="max-w-3xl space-y-2"><p className="text-xs text-[var(--color-muted-foreground)]">{data?.stale ? '证据过期' : data?.snapshot ? data.snapshot.relations.length ? '有候选 · 待核实' : '已探索 · 暂无关系证据' : '未探索'}</p>
      <h2 className="text-lg font-semibold">探索项目之间的关系</h2>
      <p className="text-sm leading-6 text-[var(--color-muted-foreground)]">分别读取选中项目的 Graphify 与源码，归纳接口调用、数据流和依赖。每条候选关系保留两端证据，运行行为仍需核实。</p></header>
    <form className="space-y-5 border-b border-[var(--color-border)] pb-6" onSubmit={event => { event.preventDefault(); start.mutate() }}>
      <fieldset disabled={running} className="space-y-3"><legend className="mb-2 text-sm font-medium">关联项目 · 选择 1–3 个</legend>
        <p className="text-xs text-[var(--color-muted-foreground)]">当前项目自动参与。所有选中项目都需要已生成 Graphify 图谱。</p>
        <div className="grid max-h-64 gap-3 overflow-y-auto sm:grid-cols-2">{candidates.map(project => <label key={project.id} className="flex min-w-0 items-start gap-3 py-1 text-sm">
          <input type="checkbox" className="mt-1" checked={selected.includes(project.id)} disabled={!selected.includes(project.id) && selected.length >= 3}
            onChange={event => setSelected(previous => event.target.checked ? [...previous, project.id] : previous.filter(id => id !== project.id))} />
          <span className="min-w-0"><span className="block">{project.metadata.name}</span><span className="block break-all text-xs leading-5 text-[var(--color-muted-foreground)]">{project.metadata.localPath}</span></span></label>)}</div>
        {!registry.isLoading && !registry.error && !candidates.length && <p className="text-sm">项目库中还没有其它项目。<a className="underline underline-offset-4" href="/tools/project-workspace?section=local">接入关联项目</a></p>}
      </fieldset>
      <div className="flex flex-wrap items-end gap-4"><label className="space-y-2 text-xs"><span className="block">探索引擎</span><select value={engine} disabled={running} onChange={event => setEngine(event.target.value as 'codex' | 'claude')}
        className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"><option value="codex">Codex</option><option value="claude">Claude Code</option></select></label>
        <label className="min-w-0 flex-1 basis-64 space-y-2 text-xs"><span className="block">重点范围 · 可选</span><Input value={scope} maxLength={500} disabled={running} onChange={event => setScope(event.target.value)} placeholder="例如：订单接口与库存数据流" /></label>
        <Button type="submit" disabled={running || query.isLoading || !selected.length || !!registry.error}>{running ? '探索中…' : data?.snapshot ? '重新探索关系' : '开始探索关系'}</Button></div>
    </form>
    <RegistryError error={registry.error} retry={() => void registry.refetch()} /><RegistryError error={query.error} retry={() => void query.refetch()} /><RegistryError error={start.error} />
    {query.isLoading && <p role="status" className="text-sm">正在读取跨项目结果…</p>}
    {data?.run && <div role="status" className="space-y-2 text-sm"><p>{data.run.stage}</p>{running && <p>可离开页面，后台继续探索；失败保留上一版。</p>}{data.run.error && <p className="text-[var(--color-destructive)]">{data.run.error}</p>}</div>}
    {data?.message && <p className="text-sm leading-6 text-[var(--color-muted-foreground)]">{data.message}</p>}
    {data?.snapshot && <TopologyResults snapshot={data.snapshot} />}
    <p className="max-w-4xl border-t border-[var(--color-border)] pt-5 text-xs leading-6 text-[var(--color-muted-foreground)]">探索结果单独保存，重新探索只替换当前项目上一版跨项目快照。缩小范围也会替换整份结果；原有业务知识和评审记录保留。</p>
  </section>
}
