import { useState } from 'react'
import { Copy } from 'lucide-react'
import type { GitBranchRef } from './types'

/** 查看提交和实际切换是两个明确动作，远端引用仅来自本地已获取记录。 */
export function GitBranchPicker({ branches, selected, busy, canSwitch, onBrowse, onSwitch, onCopy }: {
  branches: GitBranchRef[]; selected?: string; busy: boolean; canSwitch: boolean
  onBrowse: (ref: string) => void; onSwitch: (ref: string) => void; onCopy: (name: string) => void
}) {
  const [search, setSearch] = useState('')
  const filtered = branches.filter(branch => branch.name.toLowerCase().includes(search.trim().toLowerCase()))
  return <section className="space-y-2 px-4 py-3">
    <input aria-label="搜索分支" placeholder="搜索分支" value={search} onChange={event => setSearch(event.target.value)}
      className="h-10 w-full rounded-md border bg-transparent px-3 text-sm" />
    <p className="text-[13px] text-[var(--color-muted-foreground)]">查看提交不会切换工作分支。远端分支为本地已获取记录。</p>
    {!filtered.length && <p className="py-4 text-sm">没有匹配的分支。</p>}
    <ul>{filtered.map(branch => <li key={branch.ref} className="border-b py-2 last:border-0">
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="break-all text-sm font-medium">{branch.name}</p>
          <p className="mt-1 text-[13px] text-[var(--color-muted-foreground)]">{branch.remote ? '远程分支' : '本地分支'}{branch.current ? ' · 当前工作分支' : ''}{selected === branch.ref ? ' · 正在查看' : ''}</p>
        </div>
        <button type="button" aria-label={`复制分支 ${branch.name}`} onClick={() => onCopy(branch.name)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-[var(--color-muted)]"><Copy className="size-4" /></button>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" aria-label={`查看 ${branch.name} 的提交`} disabled={busy} onClick={() => onBrowse(branch.ref)} className="min-h-11 shrink-0 rounded-md px-3 text-[13px]">查看提交</button>
        {canSwitch && !branch.current && <button type="button" disabled={busy} onClick={() => onSwitch(branch.ref)} className="min-h-11 shrink-0 rounded-md border px-3 text-[13px]">切换到此分支</button>}
      </div>
    </li>)}</ul>
  </section>
}
