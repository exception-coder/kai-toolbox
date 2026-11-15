import { useMemo, useState } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { ChevronRight, Copy, FileCode2, Folder } from 'lucide-react'
import { cn } from '@/lib/utils'
import { gitChangeTree, type GitChangeNode } from '../gitChangeTreeModel'
import { statusNames, type ReviewChange } from './api'

type File = ReviewChange & { origPath: string | null }
type Row = { node: GitChangeNode<File>; depth: number }

/** Commit metadata is authoritative; never infer the file list from a possibly truncated patch. */
export function CommitChangeTree({ files, selected, loading, onSelect }: {
  files: ReviewChange[]; selected?: string; loading: boolean; onSelect: (file: ReviewChange) => void
}) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [defaultOpen, setDefaultOpen] = useState(true)
  const [feedback, setFeedback] = useState('')
  const query = search.trim().toLocaleLowerCase()
  const filtered = useMemo(() => files.filter(file => (!status || file.status === status)
    && (!query || `${file.path}\n${file.oldPath ?? ''}`.toLocaleLowerCase().includes(query))), [files, status, query])
  const tree = useMemo(() => gitChangeTree(filtered.map(file => ({ ...file, origPath: file.oldPath }))), [filtered])
  const rows = useMemo(() => {
    const result: Row[] = []
    const walk = (nodes: GitChangeNode<File>[], depth: number) => {
      for (const node of nodes) {
        result.push({ node, depth })
        if (!node.file && (expanded[node.path] ?? defaultOpen)) walk(node.children, depth + 1)
      }
    }
    walk(tree, 0)
    return result
  }, [tree, query, status, expanded, defaultOpen])
  async function copy(path: string) {
    try { await navigator.clipboard.writeText(path); setFeedback(`已复制路径：${path}`) }
    catch { setFeedback('复制失败，请允许剪贴板访问；可在文件详情中选中完整路径复制。') }
  }
  return <div className="flex h-full min-h-0 flex-col" aria-label="提交变更树">
    <div className="shrink-0 space-y-2 border-b p-3">
      <input aria-label="搜索提交文件或目录" placeholder="搜索文件或目录…" value={search} onChange={event => { setSearch(event.target.value); setExpanded({}); setDefaultOpen(true) }} className="min-h-11 w-full rounded-md border bg-[var(--color-background)] px-2 text-xs sm:min-h-9" />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select aria-label="筛选提交变更类型" value={status} onChange={event => { setStatus(event.target.value); setExpanded({}); setDefaultOpen(true) }} className="min-h-9 min-w-0 rounded border bg-[var(--color-background)] px-2">
          <option value="">全部类型 · {files.length}</option>
          {Object.entries(statusNames).map(([code, label]) => {
            const count = files.filter(file => file.status === code).length
            return count ? <option key={code} value={code}>{label} · {count}</option> : null
          })}
        </select>
        <button type="button" className="min-h-9 underline" onClick={() => { setExpanded({}); setDefaultOpen(!defaultOpen) }}>{defaultOpen ? '收起全部' : '展开全部'}</button>
        {(query || status) && <button type="button" className="min-h-9 underline" onClick={() => { setSearch(''); setStatus('') }}>清除筛选</button>}
      </div>
      <p className="text-xs text-[var(--color-muted-foreground)]">{loading && !files.length ? '正在读取提交文件清单…' : query || status ? `匹配 ${filtered.length} / ${files.length} 个文件` : `仅此提交 · ${files.length} 个文件`} · A 新增 · M 修改 · D 删除 · R 重命名</p>
      {feedback && <p role="status" className="break-all text-xs">{feedback}</p>}
    </div>
    <div className="min-h-0 flex-1"><Virtuoso data={rows} computeItemKey={(_, row) => row.node.path} itemContent={(_, { node, depth }) => {
      const file = node.file
      const open = expanded[node.path] ?? defaultOpen
      const indent = { paddingInlineStart: `${10 + Math.min(depth, 12) * 14}px` }
      if (!file) return <button type="button" className="pe-change-row" style={indent} title={node.path} aria-label={`${open ? '收起' : '展开'} ${node.path}`} aria-expanded={open}
        onClick={() => setExpanded(previous => ({ ...previous, [node.path]: !open }))}>
        <ChevronRight className={cn('size-3.5 shrink-0', open && 'rotate-90')} /><Folder className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{node.name}</span><span className="shrink-0 text-[var(--color-muted-foreground)]">{node.count}</span>
      </button>
      return <div className="flex min-w-0 items-center" style={indent}>
        <button type="button" aria-label={`${statusNames[file.status] ?? file.status} ${node.name}`} className={cn('pe-change-row min-w-0 flex-1', selected === file.path && 'bg-[var(--color-accent)]')} title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path} onClick={() => onSelect(file)}>
          <FileCode2 className="size-4 shrink-0" /><span className="min-w-0 flex-1"><span className="block truncate">{node.name}</span>{file.oldPath && <small className="block truncate text-[var(--color-muted-foreground)]">原：{file.oldPath}</small>}</span>
          <span aria-label={statusNames[file.status] ?? file.status} className={cn('pe-change-status', file.status === 'A' && 'pe-added', file.status === 'D' && 'pe-deleted')}>{file.status}</span>
        </button>
        <button type="button" aria-label={`复制路径 ${file.path}`} title="复制相对路径" className="inline-flex min-h-11 w-11 shrink-0 items-center justify-center sm:min-h-9 sm:w-9" onClick={() => void copy(file.path)}><Copy className="size-3.5" /></button>
      </div>
    }} components={{ Footer: () => !rows.length && !loading ? <p className="p-3 text-sm text-[var(--color-muted-foreground)]">{files.length ? '没有匹配文件，可清除筛选。' : '此提交没有文件变更。'}</p> : null }} /></div>
  </div>
}
