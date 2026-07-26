import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Folder, FolderOpen, Layers, Loader2, Search, X } from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { buildDirTree, collectPaths, filterDirTree, type DirNode } from '../dirTree'
import type { VideoDirectoryFacet } from '../types'

/**
 * 配色档位。目录面板要同时活在两种底色上：工作台侧栏（跟随主题的浅/深卡片）与播放器里的
 * 黑色播放列表。用主题 token 写死会在黑底上变成"黑字黑底"，所以把受底色影响的几处
 * 抽成两套类名，其余（主色高亮、布局、间距）两边完全共用。
 */
type Tone = 'surface' | 'dark'

const TONES: Record<Tone, {
  border: string
  muted: string
  input: string
  rowHover: string
  rowSelected: string
  chip: string
  iconIdle: string
}> = {
  surface: {
    border: 'border-[var(--color-border)]',
    muted: 'text-[var(--color-muted-foreground)]',
    input: 'border bg-[var(--color-background)] placeholder:text-[var(--color-muted-foreground)]',
    rowHover: 'hover:bg-[var(--color-accent)]/60',
    rowSelected: 'bg-[var(--color-accent)]',
    chip: 'border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10',
    iconIdle: 'text-[var(--color-muted-foreground)]',
  },
  dark: {
    border: 'border-white/10',
    muted: 'text-white/45',
    input: 'border border-white/15 bg-white/5 text-white placeholder:text-white/35',
    rowHover: 'hover:bg-white/10',
    rowSelected: 'bg-[var(--color-primary)]/25',
    chip: 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/20',
    iconIdle: 'text-white/45',
  },
}

interface Props {
  facets: VideoDirectoryFacet[]
  loading: boolean
  /** 当前作用域目录；null = 全部视频。 */
  selectedDir: string | null
  /** 点目录 = 只看该目录及其子目录；传 null 表示恢复「全部视频」。 */
  onSelect: (dir: string | null) => void
  /** 配色档位。默认跟随主题；播放器里的黑底列表传 dark。 */
  tone?: Tone
  /** 紧凑模式：播放器侧栏窄，去掉统计与体积列，只留目录名与计数。 */
  compact?: boolean
  className?: string
}

/**
 * 「按目录浏览」面板。工作台侧栏（桌面 tab / 移动端 Sheet）与播放器内置播放列表共用同一实现 ——
 * 与 VideoListPanel 一样只做展示 + 回调，作用域状态由页面持有，各容器共享同一份 props，
 * 因此在哪儿选目录，另一处看到的结果都一致。
 */
export function VideoDirectoryPanel({
  facets,
  loading,
  selectedDir,
  onSelect,
  tone = 'surface',
  compact = false,
  className,
}: Props) {
  const t = TONES[tone]
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
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className={cn('flex flex-col gap-2 border-b px-3 py-2', t.border)}>
        <div className="flex items-center justify-between gap-2">
          <div className={cn('min-w-0 truncate font-semibold', compact ? 'text-xs' : 'text-sm')}>
            目录{' '}
            <span className={cn('text-xs font-normal', t.muted)}>
              {compact ? `(${facets.length})` : `(${facets.length} 个 · ${totalVideos} 个视频)`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            disabled={selectedDir === null}
            className={cn(
              'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-xs disabled:opacity-50',
              t.border,
              t.rowHover,
            )}
            title="清除目录筛选，回到全部视频"
          >
            <Layers className="h-3.5 w-3.5" />
            全部视频
          </button>
        </div>
        <div className="relative">
          <Search className={cn('pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2', t.muted)} />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索目录名…"
            className={cn('w-full rounded-md py-1.5 pl-7 pr-7 text-xs', t.input)}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              title="清除"
              className={cn('absolute right-1 top-1/2 -translate-y-1/2 rounded p-1', t.muted, t.rowHover)}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        {selectedDir && (
          <div className={cn('flex items-center gap-1.5 rounded-md border px-2 py-1.5', t.chip)}>
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={selectedDir}>
              {selectedDir}
            </span>
            <button
              type="button"
              onClick={() => onSelect(null)}
              title="取消目录筛选"
              className={cn('shrink-0 rounded p-1', t.muted, t.rowHover)}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className={cn('flex flex-1 items-center justify-center gap-2 text-sm', t.muted)}>
          <Loader2 className="h-4 w-4 animate-spin" /> 加载目录…
        </div>
      ) : visible.length === 0 ? (
        <div className={cn('flex flex-1 items-center justify-center px-6 py-12 text-center text-sm', t.muted)}>
          {facets.length === 0
            ? '没有目录。请先在「磁盘空间分析」里扫描一个含视频的目录。'
            : '没有匹配的目录，换个关键词试试。'}
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
          {visible.map(node => (
            <DirRow
              key={node.path}
              node={node}
              depth={0}
              expanded={expanded}
              selectedDir={selectedDir}
              onToggle={toggle}
              onSelect={onSelect}
              tone={t}
              compact={compact}
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
  tone: (typeof TONES)[Tone]
  compact: boolean
}

/**
 * 单行目录。展开箭头与目录本体是两个独立热区：点箭头只展开、点目录直接筛选，
 * 移动端行高 ≥ 40px（py-2 + text-sm），保证手指点得中。
 */
function DirRow({ node, depth, expanded, selectedDir, onToggle, onSelect, tone, compact }: RowProps) {
  const hasChildren = node.children.length > 0
  const isOpen = expanded.has(node.path)
  const isSelected = selectedDir === node.path

  return (
    <li>
      <div
        className={cn(
          'flex items-center gap-1 border-l-2 pr-2 transition-colors',
          isSelected
            ? cn('border-l-[var(--color-primary)]', tone.rowSelected)
            : cn('border-l-transparent', tone.rowHover),
        )}
        // 缩进用内联 padding：层级是运行时算出来的，Tailwind 没法为任意深度出类名。
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        <button
          type="button"
          onClick={() => hasChildren && onToggle(node.path)}
          disabled={!hasChildren}
          aria-label={isOpen ? '折叠' : '展开'}
          className={cn('shrink-0 rounded p-1.5', tone.muted, hasChildren ? tone.rowHover : 'opacity-0')}
        >
          <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')} />
        </button>
        <button
          type="button"
          onClick={() => onSelect(node.path)}
          title={node.path}
          className={cn('flex min-w-0 flex-1 items-center gap-2 py-2 text-left', compact ? 'text-xs' : 'text-sm')}
        >
          {isOpen && hasChildren ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
          ) : (
            <Folder className={cn('h-4 w-4 shrink-0', tone.iconIdle)} />
          )}
          <span className={cn('min-w-0 flex-1 truncate', isSelected && 'font-medium')}>{node.name}</span>
          <span className={cn('shrink-0 text-xs tabular-nums', tone.muted)}>
            {/* 直属数与含子目录的累计数不一致时两个都给，免得用户点进去发现条数对不上 */}
            {node.selfCount !== node.totalCount && node.selfCount > 0
              ? `${node.selfCount}/${node.totalCount}`
              : node.totalCount}
          </span>
          {!compact && (
            <span className={cn('hidden shrink-0 text-[11px] tabular-nums sm:inline', tone.muted)}>
              {formatBytes(node.totalSize)}
            </span>
          )}
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
              tone={tone}
              compact={compact}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
