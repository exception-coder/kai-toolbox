import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import { ArrowRight, BookOpen, Code2, GitBranch, LoaderCircle, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { MarkdownViewer } from '../components/markdown/MarkdownViewer'
import { InterviewAssistant } from '../components/InterviewAssistant'
import { KnowledgeTree } from '../components/KnowledgeTree'
import {
  loadKnowledgeDetail,
  loadKnowledgeRelations,
  loadKnowledgeTree,
  type KnowledgeDetail,
  type KnowledgeRelation,
  type KnowledgeTreeNode,
} from '../api/knowledgeApi'
import '../styles/java8gu.css'

export function Java8guHubPage() {
  const [tree, setTree] = useState<KnowledgeTreeNode[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<KnowledgeDetail | null>(null)
  const [relations, setRelations] = useState<KnowledgeRelation[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadKnowledgeTree().then(nodes => {
      setTree(nodes)
      const first = firstReadable(nodes)
      if (first) setSelectedId(first.id)
    }).catch(reason => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setDetail(null)
    Promise.all([loadKnowledgeDetail(selectedId), loadKnowledgeRelations(selectedId)])
      .then(([nextDetail, nextRelations]) => {
        setDetail(nextDetail)
        setRelations(nextRelations)
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [selectedId])

  const filteredTree = useMemo(() => filterTree(tree, search.trim().toLowerCase()), [tree, search])
  const tokens = useMemo(() => marked.lexer(detail?.node.content ?? '', { gfm: true }), [detail])

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-[620px] flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b px-5 py-3">
        <div><h1 className="flex items-center gap-2 text-lg font-semibold"><BookOpen className="h-5 w-5 text-[var(--color-primary)]" />Java8 遗留系统重构知识库</h1><p className="text-xs text-[var(--color-muted-foreground)]">知识节点 · 代码重构 · 面试训练 · ERP 实践</p></div>
        <div className="rounded-full border px-3 py-1 text-xs text-[var(--color-muted-foreground)]">数据完全本地化</div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <aside className="min-h-0 overflow-y-auto border-r p-3">
          <div className="relative mb-3"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--color-muted-foreground)]" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索知识节点" className="pl-8" /></div>
          <KnowledgeTree nodes={filteredTree} selectedId={selectedId} onSelect={node => setSelectedId(node.id)} />
        </aside>

        <main className="min-h-0 overflow-y-auto px-6 py-6 xl:px-10">
          {error && <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">加载失败：{error}</div>}
          {!error && !detail && <div className="flex h-48 items-center justify-center text-[var(--color-muted-foreground)]"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" />正在读取本地知识库</div>}
          {detail && <article className="mx-auto max-w-4xl">
            <div className="mb-7"><span className="rounded-full bg-[var(--color-primary)]/10 px-2.5 py-1 text-xs text-[var(--color-primary)]">{detail.node.nodeType}</span><h2 className="mt-3 text-3xl font-semibold tracking-tight">{detail.node.title}</h2><p className="mt-2 text-[var(--color-muted-foreground)]">{detail.node.summary}</p></div>
            <MarkdownViewer tokens={tokens} />
            {detail.examples.map(example => <section key={example.id} className="mt-10"><h2 className="mb-4 flex items-center gap-2 text-xl font-semibold"><Code2 className="h-5 w-5" />{example.title}</h2><div className="grid gap-4 xl:grid-cols-2"><CodePanel title="重构前" code={example.beforeCode} tone="rose" /><CodePanel title="重构后" code={example.afterCode} tone="emerald" /></div><p className="mt-3 rounded-lg border bg-[var(--color-muted)]/25 p-3 text-sm">{example.explanation}</p></section>)}
            {relations.length > 0 && <section className="mt-10"><h2 className="mb-3 flex items-center gap-2 text-xl font-semibold"><GitBranch className="h-5 w-5" />关联知识</h2><div className="flex flex-wrap gap-2">{relations.map(relation => <button key={relation.id} type="button" onClick={() => setSelectedId(relation.node.id)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:border-[var(--color-primary)]"><span className="text-xs text-[var(--color-muted-foreground)]">{relation.relationType}</span>{relation.node.title}<ArrowRight className="h-3.5 w-3.5" /></button>)}</div></section>}
          </article>}
        </main>

        <aside className="min-h-0 overflow-y-auto border-l bg-[var(--color-card)] p-5"><InterviewAssistant interviews={detail?.interviews ?? []} /></aside>
      </div>
    </div>
  )
}

function CodePanel({ title, code, tone }: { title: string; code: string; tone: 'rose' | 'emerald' }) {
  return <div className="overflow-hidden rounded-xl border"><div className={`border-b px-3 py-2 text-xs font-semibold ${tone === 'rose' ? 'bg-rose-500/10 text-rose-600' : 'bg-emerald-500/10 text-emerald-600'}`}>{title}</div><pre className="overflow-x-auto bg-slate-950 p-4 text-xs leading-6 text-slate-100"><code>{code.replace(/^```java\n|\n```$/g, '')}</code></pre></div>
}

function firstReadable(nodes: KnowledgeTreeNode[]): KnowledgeTreeNode | null {
  for (const node of nodes) {
    if (node.nodeType !== 'CATEGORY') return node
    const child = firstReadable(node.children)
    if (child) return child
  }
  return null
}

function filterTree(nodes: KnowledgeTreeNode[], keyword: string): KnowledgeTreeNode[] {
  if (!keyword) return nodes
  return nodes.flatMap(node => {
    const children = filterTree(node.children, keyword)
    return node.title.toLowerCase().includes(keyword) || children.length > 0 ? [{ ...node, children }] : []
  })
}
