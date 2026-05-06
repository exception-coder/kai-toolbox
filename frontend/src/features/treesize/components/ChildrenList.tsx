import { useEffect, useState } from 'react'
import { File, FileVideo, Folder, Trash2 } from 'lucide-react'
import { cn, formatBytes, formatNumber } from '@/lib/utils'
import type { NodeView } from '../types'
import { isVideoFile } from '../utils'

interface ChildrenListProps {
  nodes: NodeView[]
  totalSize: number
  videoExtensions: readonly string[]
  onNavigate: (node: NodeView) => void
  onPlayVideo?: (node: NodeView) => void
  onDeleteFile?: (node: NodeView) => void
}

/** Each row carries an icon SVG, abs-positioned ratio bar and several spans; rendering
 *  thousands at once blocks the main thread. Cap and let the user reveal more on demand. */
const PAGE_SIZE = 200

export function ChildrenList({ nodes, totalSize, videoExtensions, onNavigate, onPlayVideo, onDeleteFile }: ChildrenListProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [nodes])

  const handleClick = (n: NodeView) => {
    if (n.dir) {
      onNavigate(n)
      return
    }
    if (onPlayVideo && isVideoFile(n.name, videoExtensions)) {
      onPlayVideo(n)
    }
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border bg-[var(--color-card)] text-sm text-[var(--color-muted-foreground)]">
        此目录下没有内容
      </div>
    )
  }

  const visible = nodes.slice(0, visibleCount)
  const remaining = nodes.length - visible.length

  return (
    <div className="overflow-hidden rounded-md border bg-[var(--color-card)]">
      <div className="grid grid-cols-[1fr_auto] gap-3 border-b px-3 py-2 text-xs font-medium text-[var(--color-muted-foreground)] sm:grid-cols-[1fr_120px_120px_60px] sm:px-4">
        <div>名称</div>
        <div className="text-right">大小</div>
        <div className="hidden text-right sm:block">占比</div>
        <div className="hidden text-right sm:block">类型</div>
      </div>
      <ul>
        {visible.map(n => {
          const ratio = totalSize > 0 ? (n.size / totalSize) * 100 : 0
          const isVideo = !n.dir && isVideoFile(n.name, videoExtensions)
          const clickable = n.dir || (isVideo && !!onPlayVideo)
          const showDelete = !!onDeleteFile && !n.dir
          return (
            <li
              key={n.path}
              className={cn(
                'group relative grid grid-cols-[1fr_auto] items-center gap-3 border-b py-2.5 text-sm transition-colors last:border-b-0',
                'sm:grid-cols-[1fr_120px_120px_60px]',
                showDelete ? 'pl-3 pr-10 sm:pl-4 sm:pr-11' : 'px-3 sm:px-4',
                clickable ? 'cursor-pointer hover:bg-[var(--color-accent)]' : 'cursor-default'
              )}
              onClick={clickable ? () => handleClick(n) : undefined}
            >
              <div
                className="absolute inset-y-0 left-0 bg-[var(--color-primary)]/8 transition-all"
                style={{ width: `${ratio}%` }}
              />
              <div className="relative flex min-w-0 items-center gap-2 truncate">
                {n.dir ? (
                  <Folder className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                ) : isVideo ? (
                  <FileVideo className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                ) : (
                  <File className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
                )}
                <span className="truncate" title={n.path}>{n.name}</span>
                {n.dir && (
                  <span className="ml-1 hidden shrink-0 text-xs text-[var(--color-muted-foreground)] sm:inline">
                    {formatNumber(n.fileCount)} 文件 / {formatNumber(n.dirCount)} 目录
                  </span>
                )}
              </div>
              <div className="relative text-right tabular-nums font-medium">{formatBytes(n.size)}</div>
              <div className="relative hidden text-right tabular-nums text-xs text-[var(--color-muted-foreground)] sm:block">
                {ratio.toFixed(1)}%
              </div>
              <div className="relative hidden text-right text-xs text-[var(--color-muted-foreground)] sm:block">
                {n.dir ? '目录' : '文件'}
              </div>
              {showDelete && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    onDeleteFile!(n)
                  }}
                  title="删除（移到回收站）"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-destructive)]/10 hover:text-[var(--color-destructive)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {remaining > 0 && (
        <div className="flex items-center justify-between border-t bg-[var(--color-muted)]/30 px-4 py-2 text-xs text-[var(--color-muted-foreground)]">
          <span>
            已显示 {formatNumber(visible.length)} / {formatNumber(nodes.length)} 项
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
              className="rounded-md border bg-[var(--color-background)] px-2 py-1 text-xs hover:bg-[var(--color-accent)]"
            >
              再加载 {Math.min(PAGE_SIZE, remaining)} 项
            </button>
            <button
              type="button"
              onClick={() => setVisibleCount(nodes.length)}
              className="rounded-md border bg-[var(--color-background)] px-2 py-1 text-xs hover:bg-[var(--color-accent)]"
              title="全部展开（项目较多时可能短暂卡顿）"
            >
              全部展开（{formatNumber(remaining)}）
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
