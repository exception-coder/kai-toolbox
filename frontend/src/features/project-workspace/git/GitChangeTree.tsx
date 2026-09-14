import { useMemo, useState } from 'react'
import { File, Folder } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { GitWorkspace } from './api'
import { gitChangeTree, type GitChangeNode } from './gitChangeTreeModel'

const labels: Record<string, string> = { M: '修改', A: '新增', D: '删除', R: '重命名', C: '复制', U: '冲突', T: '类型变化', '?': '未跟踪' }
const label = (value: string) => labels[value] ?? (value.trim() || '—')

export function GitChangeTree({ files }: { files: GitWorkspace['files'] }) {
  const nodes = useMemo(() => gitChangeTree(files), [files])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [defaultOpen, setDefaultOpen] = useState(true)
  const toggle = (path: string, open: boolean) => setExpanded(previous => previous[path] === open ? previous : { ...previous, [path]: open })
  const render = (node: GitChangeNode) => node.file ? <li key={node.path} className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] gap-2 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_5rem_5rem]">
    <div className="min-w-0" title={node.file.path}><span className="flex items-start gap-2"><File className="mt-0.5 size-4 shrink-0 text-[var(--color-muted-foreground)]" /><span className="whitespace-pre-wrap break-all font-mono">{node.name}{node.file.path.endsWith('/') ? '/' : ''}</span></span>{node.file.origPath && <span className="mt-1 block break-all text-[var(--color-muted-foreground)]">原路径：{node.file.origPath}</span>}</div>
    <span>{node.file.x === '?' ? '—' : label(node.file.x)}</span><span>{label(node.file.y)}</span>
  </li> : <li key={node.path}><details open={expanded[node.path] ?? defaultOpen} onToggle={event => toggle(node.path, event.currentTarget.open)}>
    <summary className="cursor-pointer rounded py-2 text-sm focus-visible:outline-2 focus-visible:outline-[var(--color-ring)]"><Folder className="mx-2 inline size-4 text-[var(--color-muted-foreground)]" /><span className="break-all">{node.name}</span><span className="ml-2 text-xs text-[var(--color-muted-foreground)]">{node.count} 项变更</span></summary>
    <ul className="ml-2 border-l border-[var(--color-border)] pl-3 sm:ml-3 sm:pl-4">{node.children.map(render)}</ul>
  </details></li>
  return <div aria-label="Git 变更目录">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="text-sm">更改 · {files.length} 项</span><div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => { setExpanded({}); setDefaultOpen(true) }}>展开全部</Button><Button variant="ghost" size="sm" onClick={() => { setExpanded({}); setDefaultOpen(false) }}>折叠全部</Button></div></div>
    <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] gap-2 border-b border-[var(--color-border)] pb-2 text-xs text-[var(--color-muted-foreground)] sm:grid-cols-[minmax(0,1fr)_5rem_5rem]"><span>目录 / 文件</span><span>暂存区</span><span>工作树</span></div>
    <ul className="py-2">{nodes.map(render)}</ul>
  </div>
}
