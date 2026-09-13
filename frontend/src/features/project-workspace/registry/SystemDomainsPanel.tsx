import { useState } from 'react'
import { BusinessKnowledgePanel } from './BusinessKnowledgePanel'
import { TopologyKnowledgePanel } from './TopologyKnowledgePanel'

/** 统一知识探索入口；项目变化时重置本地筛选，避免串用其它项目范围。 */
export function SystemDomainsPanel({ projectId }: { projectId: string }) {
  return <ProjectKnowledgePanel key={projectId} projectId={projectId} />
}

function ProjectKnowledgePanel({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<'business' | 'topology'>('business')
  return <section className="space-y-6" aria-label="项目知识探索">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-border)] pb-4">
      <h2 className="font-semibold">知识探索</h2>
      <div className="flex gap-2" role="group" aria-label="知识范围">
        <button type="button" aria-pressed={tab === 'business'} onClick={() => setTab('business')}
          className={`rounded-md px-3 py-2 text-sm ${tab === 'business' ? 'bg-[var(--color-muted)] font-medium' : 'text-[var(--color-muted-foreground)]'}`}>业务知识</button>
        <button type="button" aria-pressed={tab === 'topology'} onClick={() => setTab('topology')}
          className={`rounded-md px-3 py-2 text-sm ${tab === 'topology' ? 'bg-[var(--color-muted)] font-medium' : 'text-[var(--color-muted-foreground)]'}`}>跨项目关系</button>
      </div>
    </div>
    {tab === 'business' ? <BusinessKnowledgePanel projectId={projectId} /> : <TopologyKnowledgePanel projectId={projectId} />}
    <p className="max-w-4xl text-xs leading-6 text-[var(--color-muted-foreground)]">已有业务知识、跨项目知识及其评审记录继续保留，Agent 可通过统一知识查询核对。这里展示从代码探索的候选，只有原知识库的有效评审才能确认业务规则。</p>
  </section>
}
