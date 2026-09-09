import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { exploreDomains, getDomains } from './domainApi'
import { RegistryError } from './RegistryStates'

const confidenceLabels = { HIGH: '高', MEDIUM: '中', LOW: '低' }
const mappingLabels = { ROUTE: '页面', API: '接口', TABLE: '代码引用表' }

/** 项目内只读探索入口与带证据的领域草稿。 */
export function SystemDomainsPanel({ projectId }: { projectId: string }) {
  const [engine, setEngine] = useState<'codex' | 'claude'>('codex')
  const [scope, setScope] = useState('')
  const cache = useQueryClient()
  const query = useQuery({ queryKey: ['project-domains', projectId], queryFn: () => getDomains(projectId),
    refetchInterval: query => query.state.data?.run?.status === 'RUNNING' ? 2000 : false, refetchOnWindowFocus: false,
  })
  const start = useMutation({ mutationFn: () => exploreDomains(projectId, engine, scope),
    onSuccess: run => { cache.setQueryData(['project-domains', projectId], { ...query.data, run }); void query.refetch() },
  })
  const data = query.data
  const snapshot = data?.snapshot
  const running = start.isPending || data?.run?.status === 'RUNNING'
  return <section className="space-y-8">
    <header className="max-w-3xl space-y-2"><h2 className="text-lg font-semibold">从代码理解业务域</h2>
      <p className="text-sm leading-6 text-[var(--color-muted-foreground)]">Graphify 提供代码关系，Agent 读取源码并归纳职责、流程和关联入口。无需已有领域知识；OpenSpec 仅作为补充规格。</p></header>
    <form className="flex flex-wrap items-end gap-4 border-b border-[var(--color-border)] pb-6" onSubmit={event => { event.preventDefault(); start.mutate() }}>
      <label className="space-y-2 text-xs"><span className="block">探索引擎</span>
        <select className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm" value={engine} disabled={running} onChange={event => setEngine(event.target.value as 'codex' | 'claude')}>
          <option value="codex">Codex</option><option value="claude">Claude Code</option></select></label>
      <label className="min-w-0 flex-1 basis-64 space-y-2 text-xs"><span className="block">重点范围 · 可选</span>
        <Input value={scope} maxLength={500} disabled={running} onChange={event => setScope(event.target.value)} placeholder="例如：样衣管理；留空先探索主要业务入口" /></label>
      <Button type="submit" disabled={running || query.isLoading}>{running ? '探索中…' : snapshot ? '重新探索' : '开始探索'}</Button>
    </form>
    <RegistryError error={query.error} retry={() => void query.refetch()} /><RegistryError error={start.error} />
    {query.isLoading && <p role="status" className="text-sm">正在读取领域结果…</p>}
    {data?.run && <div role="status" className="space-y-2 text-sm"><p>{data.run.stage}</p>
      {running && <p className="text-[var(--color-muted-foreground)]">可离开此页，后台继续执行。完成后核验源码引用；失败保留上一版结果。</p>}
      {data.run.error && <p className="text-[var(--color-destructive)]">{data.run.error}</p>}</div>}
    {data?.message && <p className="text-sm leading-6 text-[var(--color-muted-foreground)]">{data.stale && <strong className="mr-2 text-[var(--color-foreground)]">需要关注</strong>}{data.message}</p>}
    {snapshot && <>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--color-muted-foreground)]"><span>领域草稿 v{snapshot.version} · {snapshot.domains.length} 个领域</span>
        <span>{snapshot.engine === 'codex' ? 'Codex' : 'Claude Code'} · {new Date(snapshot.generatedAt).toLocaleString()}</span><span>范围：{snapshot.scope || '主要业务入口'}</span></div>
      <div className="divide-y divide-[var(--color-border)]">{snapshot.domains.map(domain => <article key={domain.id} className="space-y-4 py-6 first:pt-0">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2"><h3 className="font-semibold">{domain.name}</h3><span className="text-xs text-[var(--color-muted-foreground)]">{domain.kind === 'BUSINESS' ? '业务域' : '技术域'} · 代码推断 · 置信度{confidenceLabels[domain.confidence]}</span></div>
        <p className="max-w-4xl text-sm leading-6">{domain.summary}</p>
        <details className="text-sm"><summary className="cursor-pointer py-1 text-[var(--color-muted-foreground)]">职责、流程与 {domain.evidence.length} 条源码证据</summary>
          <div className="mt-4 grid gap-6 lg:grid-cols-2"><div className="space-y-4"><h4 className="font-medium">职责与流程</h4>
            <ul className="space-y-2">{[...domain.responsibilities, ...domain.flows].map((item, index) => <li key={index} className="leading-6">{item}</li>)}</ul>
            {domain.mappings.length > 0 && <div><h4 className="mb-2 font-medium">代码关联</h4><ul className="space-y-2">{domain.mappings.map((mapping, index) => <li key={index} className="break-all">{mappingLabels[mapping.kind]} · {mapping.value}（证据 {mapping.evidenceIndex + 1}）</li>)}</ul></div>}
            {domain.unknowns.length > 0 && <div><h4 className="mb-2 font-medium">待核实</h4><ul className="space-y-2">{domain.unknowns.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}</div>
            <div className="min-w-0 space-y-4"><p className="break-all text-xs text-[var(--color-muted-foreground)]">Graphify 社区：{domain.communities.join('、')}</p>
              {domain.evidence.map((citation, index) => <details key={index}><summary className="cursor-pointer break-all text-xs leading-6">{index + 1}. {citation.path}:{citation.startLine}–{citation.endLine}</summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all bg-[var(--color-muted)] p-3 text-xs">{citation.quote}</pre></details>)}</div></div></details>
      </article>)}</div>
      {snapshot.gaps.length > 0 && <aside className="space-y-2 border-t border-[var(--color-border)] pt-6"><h3 className="text-sm font-medium">未覆盖范围与证据缺口</h3>
        <ul className="space-y-2 text-sm leading-6 text-[var(--color-muted-foreground)]">{snapshot.gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul></aside>}
    </>}
    <footer className="max-w-4xl space-y-2 border-t border-[var(--color-border)] pt-6 text-xs leading-6 text-[var(--color-muted-foreground)]">
      <p>首次探索需要可用的 Graphify 图谱和已配置的 Agent 引擎。没有图谱时，先在本项目执行完整初始化。</p>
      <p>探索只读源码，结果保存到项目 .forge/domains。重新探索会发布新版本；限定范围的结果也会替换上一版，请留意覆盖范围。图谱增量同步不会自动重跑领域语义探索。</p>
      <p>任务交接会引用当前领域草稿。系统画像在下次同步时收录该快照；引用核对不代表业务规则、接口行为或真实数据库表结构已验证。</p>
    </footer>
  </section>
}
