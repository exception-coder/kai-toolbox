import { useEffect, useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Virtuoso } from 'react-virtuoso'
import { ChevronRight, FileCode2, Folder, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { gitChangeTree, type GitChangeNode } from '../gitChangeTreeModel'
import { reviewRequest, statusNames, type ReviewChange, type ReviewTree } from './api'

type TreeFile = ReviewChange & { origPath: string | null }
type Group = 'tracked' | 'untracked'
type Row =
  | { kind: 'group'; group: Group; count: number }
  | { kind: 'folder'; group: Group; path: string; name: string; depth: number; lazy: boolean; count?: number }
  | { kind: 'file'; file: ReviewChange; name: string; depth: number }
  | { kind: 'loading'; path: string; depth: number }
  | { kind: 'error'; path: string; depth: number; message: string; retry: () => void }
  | { kind: 'page'; path: string; depth: number; offset: number; hasMore: boolean }

/** The list stays virtualized while untracked directories load only when opened. */
export function WorkspaceChangeTree({ files, endpoint, repo, selected, searching, loading, onSelect }: {
  files: ReviewChange[]; endpoint: string; repo: string; selected?: string; searching: boolean; loading: boolean; onSelect: (file: ReviewChange) => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ 'group:tracked': true, 'group:untracked': false })
  const [lazyPaths, setLazyPaths] = useState<string[]>([])
  const [offsets, setOffsets] = useState<Record<string, number>>({})
  useEffect(() => { if (searching) setExpanded(previous => ({ ...previous, 'group:tracked': true, 'group:untracked': true })) }, [searching])
  const groups = useMemo(() => {
    const tracked: TreeFile[] = [], untracked: TreeFile[] = []
    for (const file of files) (file.x === '?' && file.y === '?' ? untracked : tracked).push({ ...file, origPath: file.oldPath })
    return { tracked: { count: tracked.length, nodes: gitChangeTree(tracked) }, untracked: { count: untracked.length, nodes: gitChangeTree(untracked) } }
  }, [files])
  const queries = useQueries({ queries: lazyPaths.map(path => ({
    queryKey: ['project-explorer', endpoint, repo, 'untracked-directory', path, offsets[path] ?? 0],
    queryFn: ({ signal }: { signal: AbortSignal }) => reviewRequest<ReviewTree>(endpoint, repo, 'workspace-directory', { path, offset: offsets[path] ?? 0 }, signal),
    enabled: expanded['group:untracked'] && !!expanded[`untracked:${path}`] && !searching,
    retry: false, refetchOnWindowFocus: false,
  })) })
  const queryMap = new Map(lazyPaths.map((path, index) => [path, queries[index]]))
  const toggle = (key: string, fallback: boolean, lazyPath?: string) => {
    setExpanded(previous => ({ ...previous, [key]: !(previous[key] ?? fallback) }))
    if (lazyPath) setLazyPaths(previous => previous.includes(lazyPath) ? previous : [...previous, lazyPath])
  }
  const rows: Row[] = []
  const walk = (nodes: GitChangeNode<TreeFile>[], group: Group, depth: number) => {
    for (const node of nodes) {
      const file = node.file
      const lazy = !!file?.path.endsWith('/') && group === 'untracked'
      if (!file || lazy) {
        const path = node.path, key = `${group}:${path}`
        const open = expanded[key] ?? (group === 'tracked' || searching)
        rows.push({ kind: 'folder', group, path, name: node.name, depth, lazy, count: lazy ? undefined : node.count })
        if (!open) continue
        if (!lazy) { walk(node.children, group, depth + 1); continue }
        const query = queryMap.get(path)
        if (!query || query.isFetching && !query.data) rows.push({ kind: 'loading', path, depth: depth + 1 })
        else if (query.error) rows.push({ kind: 'error', path, depth: depth + 1, message: query.error instanceof Error ? query.error.message : String(query.error), retry: () => void query.refetch() })
        else if (query.data) {
          const children: GitChangeNode<TreeFile>[] = query.data.entries.map(entry => ({
            path: entry.path, name: entry.name, count: 1, children: [],
            file: { path: entry.path + (entry.type === 'tree' ? '/' : ''), oldPath: null, origPath: null, status: 'A', x: '?', y: '?' },
          }))
          walk(children, group, depth + 1)
          const offset = offsets[path] ?? 0
          if (offset || query.data.hasMore) rows.push({ kind: 'page', path, depth: depth + 1, offset, hasMore: query.data.hasMore })
          if (!children.length && !offset && !query.data.hasMore) rows.push({ kind: 'error', path, depth: depth + 1, message: '没有可见的未跟踪文件', retry: () => void query.refetch() })
        }
      } else rows.push({ kind: 'file', file, name: node.name, depth })
    }
  }
  for (const group of ['tracked', 'untracked'] as const) {
    const data = groups[group]
    if (!data.count) continue
    rows.push({ kind: 'group', group, count: data.count })
    if (expanded[`group:${group}`]) walk(data.nodes, group, 1)
  }
  return <Virtuoso data={rows} computeItemKey={(_, row) => row.kind === 'group' ? `group:${row.group}` : row.kind === 'file' ? `file:${row.file.path}` : `${row.kind}:${row.path}`} itemContent={(_, row) => {
    if (row.kind === 'group') {
      const label = row.group === 'tracked' ? '已跟踪变更' : '未跟踪文件'
      const open = expanded[`group:${row.group}`]
      return <button className="pe-change-group" aria-expanded={open} onClick={() => toggle(`group:${row.group}`, false)}>
        <ChevronRight className={cn('size-3.5 shrink-0', open && 'rotate-90')} /><strong>{label}</strong><span className="text-[var(--color-muted-foreground)]">{row.count} 项{row.group === 'untracked' && files.some(file => file.x === '?' && file.path.endsWith('/')) && '（含目录）'}</span>
      </button>
    }
    const indent = { paddingInlineStart: `${10 + row.depth * 14}px` }
    if (row.kind === 'folder') {
      const key = `${row.group}:${row.path}`, fallback = row.group === 'tracked' || searching
      const open = expanded[key] ?? fallback
      return <button className="pe-change-row" style={indent} title={row.path} aria-expanded={open} aria-label={`${open ? '收起' : '展开'} ${row.path}`} onClick={() => toggle(key, fallback, row.lazy ? row.path : undefined)}>
        <ChevronRight className={cn('size-3.5 shrink-0', open && 'rotate-90')} /><Folder className="size-4 shrink-0 text-[var(--color-muted-foreground)]" /><span className="min-w-0 truncate">{row.name}</span>{row.count !== undefined && <span className="text-[var(--color-muted-foreground)]">{row.count}</span>}
      </button>
    }
    if (row.kind === 'file') {
      const untracked = row.file.x === '?' && row.file.y === '?'
      const label = untracked ? '未跟踪' : statusNames[row.file.status] ?? row.file.status
      return <button className={cn('pe-change-row', selected === row.file.path && 'bg-[var(--color-accent)]')} style={indent} title={row.file.oldPath ? `${row.file.oldPath} → ${row.file.path}` : `${row.file.path} · 暂存 ${row.file.x} / 工作区 ${row.file.y}`} onClick={() => onSelect(row.file)}>
        <FileCode2 className="size-4 shrink-0 text-[var(--color-muted-foreground)]" /><span className="min-w-0 flex-1"><span className="block truncate">{row.name}</span>{row.file.oldPath && <small className="block truncate text-[var(--color-muted-foreground)]">原：{row.file.oldPath}</small>}</span><span className={cn('pe-change-status', untracked && 'pe-added', row.file.status === 'D' && 'pe-deleted')} aria-label={label}>{untracked ? '?' : row.file.status}</span>
      </button>
    }
    if (row.kind === 'loading') return <p className="flex items-center gap-1 py-2 text-xs" style={indent}><Loader2 className="size-3 animate-spin" />读取目录…</p>
    if (row.kind === 'error') return <div className="py-2 text-xs" style={indent} role="status">{row.message} <button className="underline" onClick={row.retry}>重试</button></div>
    return <div className="flex gap-3 py-2 text-xs" style={indent}>
      {row.offset > 0 && <button className="underline" onClick={() => setOffsets(previous => ({ ...previous, [row.path]: Math.max(0, row.offset - 150) }))}>上一页</button>}
      {row.hasMore && <button className="underline" onClick={() => setOffsets(previous => ({ ...previous, [row.path]: row.offset + 150 }))}>下一页</button>}
    </div>
  }} components={{ Footer: () => !rows.length && !loading ? <p className="p-3 text-sm text-[var(--color-muted-foreground)]">此范围没有变更</p> : null }} />
}
