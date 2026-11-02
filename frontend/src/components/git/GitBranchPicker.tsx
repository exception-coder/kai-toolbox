import { useState } from 'react'
import { ArrowLeft, ChevronRight, Copy, RefreshCw } from 'lucide-react'
import { branchSource, groupBranches } from './branchGroups'
import { GitBranchSourceRow } from './GitBranchSourceRow'
import type { GitBranchComparison, GitBranchRef, GitWorkspaceStatus } from './types'

export function GitBranchPicker({ branches, selected, busy, loading, canSwitch, workspace, compare, onRefresh, onBrowse, onSwitch, onCopy }: {
  branches: GitBranchRef[]; selected?: string; busy: boolean; loading: boolean; canSwitch: boolean
  workspace: GitWorkspaceStatus | null; compare?: (base: string, ref: string) => Promise<GitBranchComparison>
  onRefresh: () => void; onBrowse: (ref: string) => void; onSwitch: (ref: string) => void; onCopy: (name: string) => void
}) {
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState('all')
  const [remote, setRemote] = useState('')
  const [detail, setDetail] = useState<string>()
  const groups = groupBranches(branches)
  const remotes = [...new Set(branches.filter(branch => branch.remote).map(branchSource).filter(Boolean))].sort()
  const visible = (branch: GitBranchRef) => scope === 'all' || (scope === 'local' ? !branch.remote : branch.remote && (!remote || branchSource(branch) === remote))
  const needle = search.trim().toLowerCase()
  const filtered = groups.filter(group => group.sources.some(branch => visible(branch) && `${group.name} ${branch.name} ${branch.ref}`.toLowerCase().includes(needle)))
  const active = groups.find(group => group.key === detail)
  return <section className="min-w-0 space-y-2 px-4 py-3">
    <div className="flex min-w-0 gap-2">
      <input aria-label="搜索分支" placeholder="搜索完整分支名称" value={search} onChange={event => { setSearch(event.target.value); setDetail(undefined) }} className="h-11 min-w-0 flex-1 rounded-md border bg-transparent px-3 text-sm" />
      <button type="button" aria-label="刷新状态" disabled={busy || loading} onClick={onRefresh} className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border disabled:opacity-50"><RefreshCw className="size-4" /></button>
    </div>
    <div role="group" aria-label="分支来源筛选" className="flex gap-1 border-b">
      {([['all', '全部'], ['local', '本地'], ['remote', '远程']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={scope === value} onClick={() => { setScope(value); setDetail(undefined) }} className={`min-h-11 flex-1 rounded-md px-3 text-sm ${scope === value ? 'bg-[var(--color-muted)] font-medium' : ''}`}>{label}</button>)}
    </div>
    {scope === 'remote' && <select aria-label="远程来源" value={remote} onChange={event => { setRemote(event.target.value); setDetail(undefined) }} className="h-11 w-full rounded-md border bg-[var(--color-background)] px-3 text-sm"><option value="">全部远程来源</option>{remotes.map(name => <option key={name} value={name}>{name}</option>)}</select>}
    <p className="text-xs leading-relaxed text-[var(--color-muted-foreground)]">远程引用为本地记录；同名不代表同步。{workspace ? '刷新仅核对当前上游，不检查全部远程。' : '刷新只重新读取本地引用。'}</p>
    {workspace?.remoteChecked && <p className="break-all text-xs text-[var(--color-muted-foreground)]">当前上游 {workspace.upstream} 最近核对：{workspace.checkedAt}</p>}
    {loading ? <p role="status" className="py-3 text-sm">读取分支中…</p> : active ? <>
      <div className="flex min-w-0 items-start gap-2 border-b">
        <button type="button" aria-label="返回分支分组" disabled={busy} onClick={() => setDetail(undefined)} className="inline-flex size-11 shrink-0 items-center justify-center"><ArrowLeft className="size-4" /></button>
        <h3 className="min-w-0 flex-1 py-3 text-sm font-medium [overflow-wrap:anywhere]">{active.name}</h3>
        <button type="button" aria-label={`复制分支 ${active.name}`} onClick={() => onCopy(active.name)} className="inline-flex size-11 shrink-0 items-center justify-center"><Copy className="size-4" /></button>
      </div>
      <ul>{active.sources.filter(visible).map(branch => <GitBranchSourceRow key={`${branch.ref}:${branch.head}:${active.sources.find(source => !source.remote)?.head ?? ''}`} branch={branch} local={active.sources.find(source => !source.remote && source.ref.startsWith('refs/heads/'))} selected={selected} busy={busy} canSwitch={canSwitch} compare={compare} onBrowse={onBrowse} onSwitch={onSwitch} onCopy={onCopy} />)}</ul>
    </> : <ul>{filtered.map(group => <li key={group.key} className="border-b last:border-0">
      <button type="button" aria-label={`查看分支 ${group.name} 的来源`} disabled={busy} onClick={() => setDetail(group.key)} className={`flex min-h-14 w-full min-w-0 items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-[var(--color-muted)] ${group.current ? 'bg-[var(--color-muted)]' : ''}`}>
        <span className="min-w-0 flex-1"><span className="block text-sm font-medium [overflow-wrap:anywhere]">{group.name}{group.current && <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">当前</span>}</span><span className="mt-1 block text-xs text-[var(--color-muted-foreground)] [overflow-wrap:anywhere]">{group.sources.filter(visible).map(branch => branchSource(branch) || '来源未登记').join(' · ')}</span></span><ChevronRight className="size-4 shrink-0" />
      </button>
    </li>)}{!filtered.length && <li className="py-4 text-sm">没有匹配的分支，可调整筛选或刷新。</li>}</ul>}
  </section>
}
