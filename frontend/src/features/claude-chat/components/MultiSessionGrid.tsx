import { LayoutGrid, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SessionPane } from './SessionPane'

interface Props {
  /** 并行展示的会话 id 列表。 */
  sessionIds: string[]
  /** 退出分屏，回单会话视图。 */
  onExit: () => void
  /** 从分屏移除某个会话块。 */
  onRemove: (sessionId: string) => void
}

/** 按块数选列数：1 列 / 2 列 / 3 列，移动端始终单列。 */
function colsClass(n: number): string {
  if (n <= 1) return 'grid-cols-1'
  if (n <= 4) return 'grid-cols-1 md:grid-cols-2'
  return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
}

/**
 * 多会话并行分屏容器：每个会话一个独立可交互的 {@link SessionPane}（各自 WS / 状态 / 弹窗）。
 * 响应式栅格，每块至少 320px 高、内部各自滚动；块多时整体纵向滚动。
 */
export function MultiSessionGrid({ sessionIds, onExit, onRemove }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b bg-[var(--color-muted)] px-3 py-1.5 text-xs">
        <LayoutGrid className="size-4 text-[var(--color-primary)]" />
        <span className="font-medium">分屏并看 · {sessionIds.length} 个会话</span>
        <Button variant="ghost" size="sm" className="ml-auto gap-1" onClick={onExit}>
          <X className="size-4" /> 退出分屏
        </Button>
      </div>
      {sessionIds.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
          没有选中的会话
        </div>
      ) : (
        <div className={`grid flex-1 gap-2 overflow-auto p-2 auto-rows-[minmax(320px,1fr)] ${colsClass(sessionIds.length)}`}>
          {sessionIds.map(id => (
            <SessionPane key={id} sessionId={id} onClose={() => onRemove(id)} />
          ))}
        </div>
      )}
    </div>
  )
}
