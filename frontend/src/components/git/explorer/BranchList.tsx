import { useEffect, useState } from 'react'
import { ChevronRight, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GitBranchRef } from '../types'

type BranchNode = { name: string; branch?: GitBranchRef; children: Map<string, BranchNode> }

function branchTree(branches: GitBranchRef[]): BranchNode[] {
  const root = new Map<string, BranchNode>()
  for (const branch of branches) {
    let children = root
    const segments = branch.name.split('/')
    segments.forEach((segment, index) => {
      let node = children.get(segment)
      if (!node) { node = { name: segment, children: new Map() }; children.set(segment, node) }
      if (index === segments.length - 1) node.branch = branch
      children = node.children
    })
  }
  return [...root.values()]
}

function contains(node: BranchNode, ref: string): boolean {
  return node.branch?.ref === ref || [...node.children.values()].some(child => contains(child, ref))
}

function BranchNodes({ nodes, selected, onSelect, searching }: { nodes: BranchNode[]; selected: string; onSelect: (ref: string) => void; searching: boolean }) {
  return <>{nodes.map(node => <div key={node.name}>
    {node.branch && <button type="button" title={node.branch.name} className={cn('pe-branch-row', selected === node.branch.ref && 'bg-[var(--color-accent)]')} aria-pressed={selected === node.branch.ref} onClick={() => onSelect(node.branch!.ref)}><GitBranch className="size-3.5 shrink-0" /><span className="min-w-0 break-all">{node.name}{node.branch.current && <span className="ml-1 text-[var(--color-muted-foreground)]">当前</span>}</span></button>}
    {node.children.size > 0 && <BranchFolder {...{ node, selected, onSelect, searching }} />}
  </div>)}</>
}

function BranchFolder({ node, selected, onSelect, searching }: { node: BranchNode; selected: string; onSelect: (ref: string) => void; searching: boolean }) {
  const containsSelected = contains(node, selected)
  const [expanded, setExpanded] = useState(searching || containsSelected)
  useEffect(() => { if (searching || containsSelected) setExpanded(true) }, [searching, containsSelected])
  return <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary className="pe-branch-row cursor-pointer"><ChevronRight className="size-3.5 shrink-0" /><span className="break-all">{node.name}</span></summary><div className="ml-3 border-l pl-1"><BranchNodes nodes={[...node.children.values()]} {...{ selected, onSelect, searching }} /></div></details>
}

/** Branch navigation is read-only: selecting an item pins its commit, never checks it out. */
export function BranchList({ branches, selected, onSelect }: { branches: GitBranchRef[]; selected: string; onSelect: (ref: string) => void }) {
  const [search, setSearch] = useState('')
  const matches = branches.filter(branch => branch.name.toLowerCase().includes(search.toLowerCase()))
  const groups = [{ title: '本地分支', remote: false }, { title: '远端分支', remote: true }]
  return <aside className="pe-pane pe-branch-pane border-r" aria-label="分支列表">
    <div className="border-b p-3"><p className="mb-2 text-xs font-medium">分支</p><input aria-label="搜索分支" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索分支" className="w-full rounded border bg-transparent px-2 py-2 text-xs" /></div>
    <div className="min-h-0 flex-1 overflow-auto p-2">
      <button type="button" className={cn('pe-branch-row', !selected && 'bg-[var(--color-accent)]')} aria-pressed={!selected} onClick={() => onSelect('')}><GitBranch className="size-3.5 shrink-0" />当前分支 · HEAD</button>
      {groups.map(group => <div key={group.title} className="mt-3"><p className="px-2 pb-1 text-[11px] text-[var(--color-muted-foreground)]">{group.title}</p><BranchNodes nodes={branchTree(matches.filter(branch => branch.remote === group.remote))} {...{ selected, onSelect }} searching={!!search} /></div>)}
      {search && matches.length === 0 && <p className="p-2 text-xs text-[var(--color-muted-foreground)]">没有匹配的分支</p>}
    </div>
    <p className="border-t p-3 text-xs text-[var(--color-muted-foreground)]">仅查看本地保存的分支，不会切换或获取远端。</p>
  </aside>
}
