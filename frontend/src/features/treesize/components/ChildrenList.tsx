import { File, Folder } from 'lucide-react'
import { cn, formatBytes, formatNumber } from '@/lib/utils'
import type { NodeView } from '../types'

interface ChildrenListProps {
  nodes: NodeView[]
  totalSize: number
  onNavigate: (node: NodeView) => void
}

export function ChildrenList({ nodes, totalSize, onNavigate }: ChildrenListProps) {
  if (nodes.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border bg-[var(--color-card)] text-sm text-[var(--color-muted-foreground)]">
        此目录下没有内容
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-md border bg-[var(--color-card)]">
      <div className="grid grid-cols-[1fr_120px_120px_60px] gap-3 border-b px-4 py-2 text-xs font-medium text-[var(--color-muted-foreground)]">
        <div>名称</div>
        <div className="text-right">大小</div>
        <div className="text-right">占比</div>
        <div className="text-right">类型</div>
      </div>
      <ul>
        {nodes.map(n => {
          const ratio = totalSize > 0 ? (n.size / totalSize) * 100 : 0
          return (
            <li
              key={n.path}
              className={cn(
                'group relative grid cursor-pointer grid-cols-[1fr_120px_120px_60px] items-center gap-3 border-b px-4 py-2.5 text-sm transition-colors last:border-b-0',
                'hover:bg-[var(--color-accent)]'
              )}
              onClick={() => onNavigate(n)}
            >
              <div
                className="absolute inset-y-0 left-0 bg-[var(--color-primary)]/8 transition-all"
                style={{ width: `${ratio}%` }}
              />
              <div className="relative flex items-center gap-2 truncate">
                {n.dir ? (
                  <Folder className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                ) : (
                  <File className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
                )}
                <span className="truncate" title={n.path}>{n.name}</span>
                {n.dir && (
                  <span className="ml-1 shrink-0 text-xs text-[var(--color-muted-foreground)]">
                    {formatNumber(n.fileCount)} 文件 / {formatNumber(n.dirCount)} 目录
                  </span>
                )}
              </div>
              <div className="relative text-right tabular-nums font-medium">{formatBytes(n.size)}</div>
              <div className="relative text-right tabular-nums text-xs text-[var(--color-muted-foreground)]">
                {ratio.toFixed(1)}%
              </div>
              <div className="relative text-right text-xs text-[var(--color-muted-foreground)]">
                {n.dir ? '目录' : '文件'}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
