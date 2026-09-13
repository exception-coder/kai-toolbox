import type { TopologyView } from './topologyApi'

const kindLabels = { API: '接口', DATA: '数据关系', DEPENDENCY: '依赖', FLOW: '跨项目流程' }
const confidenceLabels = { HIGH: '高', MEDIUM: '中', LOW: '低' }

/** 关系和两端原文共同呈现，避免只有关系摘要而无法追溯。 */
export function TopologyResults({ snapshot }: { snapshot: NonNullable<TopologyView['snapshot']> }) {
  const name = (id: string) => snapshot.participants.find(project => project.projectId === id)?.name ?? id
  return <div className="space-y-6">
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--color-muted-foreground)]"><span>关系候选 v{snapshot.version} · {snapshot.relations.length} 条</span><span>{new Date(snapshot.generatedAt).toLocaleString()}</span><span>范围：{snapshot.scope || '接口、数据流和依赖'}</span></div>
    <p className="text-sm">参与项目：{snapshot.participants.map(project => project.name).join('、')}</p>
    {!snapshot.relations.length && <p className="text-sm">本轮未发现有双端证据的关系，请查看证据缺口后调整范围。</p>}
    <div className="divide-y divide-[var(--color-border)]">{snapshot.relations.map(relation => <article key={relation.id} className="space-y-3 py-5 first:pt-0">
      <h3 className="font-medium">{name(relation.fromProjectId)} → {name(relation.toProjectId)}</h3>
      <p className="text-xs text-[var(--color-muted-foreground)]">{kindLabels[relation.kind]} · 代码推断 · 置信度{confidenceLabels[relation.confidence]}</p>
      <p className="max-w-4xl text-sm leading-6">{relation.summary}</p>
      <details className="text-sm"><summary className="cursor-pointer py-1">查看 {relation.evidence.length} 条双端源码证据</summary>
        <div className="mt-3 space-y-4">{relation.evidence.map((ref, index) => {
          const project = snapshot.participants.find(item => item.projectId === ref.projectId)
          const source = project?.findings.domains.find(item => item.id === ref.domainId)?.evidence[ref.evidenceIndex]
          return <div key={index} className="min-w-0"><p className="break-all text-xs leading-6">{project?.name ?? ref.projectId} · {source ? `${source.path}:${source.startLine}–${source.endLine}` : '引用缺失，请重新探索'}</p>
            {source && <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all bg-[var(--color-muted)] p-3 text-xs">{source.quote}</pre>}</div>
        })}</div></details>
      {relation.unknowns.length > 0 && <div className="text-sm"><h4 className="mb-2 font-medium">待核实</h4><ul className="space-y-2 text-[var(--color-muted-foreground)]">{relation.unknowns.map((text, index) => <li key={index}>{text}</li>)}</ul></div>}
    </article>)}</div>
    <aside className="space-y-3"><h3 className="text-sm font-medium">覆盖范围与证据缺口</h3><ul className="space-y-2 text-sm leading-6 text-[var(--color-muted-foreground)]">{snapshot.gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul></aside>
  </div>
}
