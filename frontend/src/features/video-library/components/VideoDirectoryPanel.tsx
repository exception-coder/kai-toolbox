import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Folder, FolderOpen, Layers, Loader2, Search, X } from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { buildDirTree, collectPaths, filterDirTree, type DirNode } from '../dirTree'
import type { VideoDirectoryFacet } from '../types'

interface Props {
  facets: VideoDirectoryFacet[]
  loading: boolean
  /** 当前作用域目录；null = 全部视频。 */
  selectedDir: string | null
  /** 点目录 = 只看该目录及其子目录；传 null 表示恢复「全部视频」。 */
  onSelect: (dir: string | null) => void
}

/**
 * 「按目录浏览」面板。桌面端挂在左侧栏的目录 tab，移动端复用同一组件塞进底部 Sheet ——
 * 与 VideoListPanel 一样只做展示 + 回调，作用域状态由页面持有，两个容器共享同一份 props。
 */
export function VideoDirectoryPanel({ facets, loading, selectedDir, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const tree = useMemo(() => buildDirTree(facets), [facets])
  const visible = useMemo(() => filterDirTree(tree, query), [tree, query])

  // 首次拿到数据时展开顶层，让用户一进来就能看到第一批可点的目录，而不是一排折叠的盘符。
  useEffect(() => {
    if (tree.length === 0) return
    setExpanded(prev => (prev.size > 0 ? prev : new Set(tree.map(n => n.path))))
  }, [tree])

  // 搜索时整棵结果树展开（否则命中项藏在折叠节点里等于没搜）；清空关键词后回到顶层展开。
  useEffect(() => {
    if (!query.trim()) return
    setExpanded(new Set(collectPaths(visible)))
  }, [query, visible])

  const toggle = (path: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const totalVideos = useMemo(() => tree.reduce((acc, n) => acc + n.totalCount, 0), [tree])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 truncate text-sm font-semibold">
            目录{' '}
            <span className="text-xs font-normal text-[var(--color-muted-foreground)]">
              ({facets.length} 个 · {totalVideos} 个视频)
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            disabled={selectedDir === null}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-xs hover:bg-[var(--color-accent)] disabled:opacity-50"
            title="清除目录筛选，回到全部视频"
          >
            <Layers className="h-3.5 w-3.5" />
            全部视频
          </button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索目录名…"
            className="w-full rounded-md border bg-[var(--color-background)] py-1.5 pl-7 pr-7 text-xs placeholder:text-[var(--color-muted-foreground)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              title="清除"
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        {selectedDir && (
          <div className="flex items-center gap-1.5 rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-2 py-1.5">
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={selectedDir}>
              {selectedDir}
            </span>
            <button
              type="button"
              onClick={() => onSelect(null)}
              title="取消目录筛选"
              className="shrink-0 rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--color-muted-foreground)]">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载目录…
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 py-12 text-center text-sm text-[var(--color-muted-foreground)]">
          {facets.length === 0
            ? '没有目录。请先在「磁盘空间分析」里扫描一个含视频的目录。'
            : '没有匹配的目录，换个关键词试试。'}
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto overscroll-contain py-1">
          {visible.map(node => (
            <DirRow
              key={node.path}
              node={node}
              depth={0}
              expanded={expanded}
              selectedDir={selectedDir}
              onToggle={toggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

interface RowProps {
  node: DirNode
  depth: number
  expanded: Set<string>
  selectedDir: string | null
  onToggle: (path: string) => void
  onSelect: (dir: string) => void
}

/**
 * 单行目录。展开箭头与目录本体是两个独立热区：点箭头只展开、点目录直接筛选，
 * 移动端行高 ≥ 40px（py-2 + text-sm），保证手指点得中。
 */
function DirRow({ node, depth, expanded, selectedDir, onToggle, onSelect }: RowProps) {
  const hasChildren = node.children.length > 0
  const isOpen = expanded.has(node.path)
  const isSelected = selectedDir === node.path

  return (
    <li>
      <div
        className={cn(
          'flex items-center gap-1 border-l-2 pr-2 transition-colors',
          isSelected
            ? 'border-l-[var(--color-primary)] bg-[var(--color-accent)]'
            : 'border-l-transparent hover:bg-[var(--color-accent)]/60',
        )}
        // 缩进用内联 padding：层级是运行时算出来的，Tailwind 没法为任意深度出类名。
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        <button
          type="button"
          onClick={() => hasChildren && onToggle(node.path)}
          disabled={!hasChildren}
          aria-label={isOpen ? '折叠' : '展开'}
          className={cn(
            'shrink-0 rounded p-1.5 text-[var(--color-muted-foreground)]',
            hasChildren ? 'hover:bg-[var(--color-accent)]' : 'opacity-0',
          )}
        >
          <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')} />
        </button>
        <button
          type="button"
          onClick={() => onSelect(node.path)}
          title={node.path}
          className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left text-sm"
        >
          {isOpen && hasChildren ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
          )}
          <span className={cn('min-w-0 flex-1 truncate', isSelected && 'font-medium')}>{node.name}</span>
          <span className="shrink-0 text-xs tabular-nums text-[var(--color-muted-foreground)]">
            {/* 直属数与含子目录的累计数不一致时两个都给，免得用户点进去发现条数对不上 */}
            {node.selfCount !== node.totalCount && node.selfCount > 0
              ? `${node.selfCount}/${node.totalCount}`
              : node.totalCount}
          </span>
          <span className="hidden shrink-0 text-[11px] tabular-nums text-[var(--color-muted-foreground)] sm:inline">
            {formatBytes(node.totalSize)}
          </span>
        </button>
      </div>
      {isOpen && hasChildren && (
        <ul>
          {node.children.map(child => (
            <DirRow
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedDir={selectedDir}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
