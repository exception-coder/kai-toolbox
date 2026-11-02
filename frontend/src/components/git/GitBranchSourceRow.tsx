import { useEffect, useRef, useState } from 'react'
import { Copy } from 'lucide-react'
import { branchSource } from './branchGroups'
import type { GitBranchComparison, GitBranchRef } from './types'

export function GitBranchSourceRow({ branch, local, selected, busy, canSwitch, compare, onBrowse, onSwitch, onCopy }: {
  branch: GitBranchRef; local?: GitBranchRef; selected?: string; busy: boolean; canSwitch: boolean
  compare?: (base: string, ref: string) => Promise<GitBranchComparison>
  onBrowse: (ref: string) => void; onSwitch: (ref: string) => void; onCopy: (name: string) => void
}) {
  const [result, setResult] = useState<GitBranchComparison>()
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const check = async () => {
    if (!compare || !local || checking) return
    setChecking(true); setError('')
    try {
      const value = await compare(local.ref, branch.ref)
      if (!mounted.current) return
      if (value.baseRef !== local.ref || value.ref !== branch.ref || value.baseHead !== local.head || value.head !== branch.head) throw new Error('分支提交已变化，请刷新后重新核对。')
      setResult(value)
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { if (mounted.current) setChecking(false) }
  }
  const source = branchSource(branch)
  return <li className="min-w-0 space-y-2 border-b py-3 text-[13px] last:border-0">
    <div className="flex min-w-0 items-start gap-2">
      <div className="min-w-0 flex-1"><p className="font-medium [overflow-wrap:anywhere]">{source || '来源未登记'}{branch.current ? ' · 当前工作分支' : ''}{selected === branch.ref ? ' · 正在查看' : ''}</p><p className="mt-1 select-text [overflow-wrap:anywhere]">{branch.name}</p><p className="text-xs text-[var(--color-muted-foreground)] [overflow-wrap:anywhere]">{branch.ref} · {branch.head.slice(0, 12) || '尚无提交'}</p>{branch.upstream && <p className="text-xs [overflow-wrap:anywhere]">上游：{branch.upstream}</p>}</div>
      <button type="button" aria-label={`复制引用 ${branch.name}`} onClick={() => onCopy(branch.name)} className="inline-flex size-11 shrink-0 items-center justify-center"><Copy className="size-4" /></button>
    </div>
    {branch.remote && <div className="text-xs leading-relaxed text-[var(--color-muted-foreground)]">
      <p>{result ? result.ahead && result.behind ? `已分叉 · 本地领先 ${result.ahead} / 落后 ${result.behind}` : result.ahead || result.behind ? `本地领先 ${result.ahead} / 落后 ${result.behind}` : '本地记录一致' : !local ? '没有同名本地分支作为比较基准' : local.head && local.head === branch.head ? '提交相同（本地记录）' : '提交不同，差异未核验'}</p>
      <p>{result ? `差异核对：${result.checkedAt}；非远程 fetch 时间` : '此来源最近 fetch 时间未提供；实时远程状态未核验'}</p>
      {compare && local && <button type="button" disabled={busy || checking} onClick={() => void check()} className="min-h-11 underline">{checking ? '核对中…' : '核对差异'}</button>}
      {error && <p role="alert" className="text-[var(--color-destructive)] [overflow-wrap:anywhere]">差异暂不可用：{error}</p>}
      {local && <p>已有同名本地分支；请使用本地来源切换，不会覆盖或重新绑定上游。</p>}
    </div>}
    <div className="flex flex-wrap justify-end gap-2"><button type="button" aria-label={`查看 ${branch.name} 的提交`} disabled={busy} onClick={() => onBrowse(branch.ref)} className="min-h-11 rounded-md px-3">查看提交</button>{canSwitch && !branch.current && (!branch.remote || (!local && !!source)) && <button type="button" disabled={busy} onClick={() => onSwitch(branch.ref)} className="min-h-11 rounded-md border px-3">{branch.remote ? '创建跟踪分支' : '切换到此分支'}</button>}</div>
  </li>
}
