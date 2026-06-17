import { useCallback, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SessionPane } from './SessionPane'
import { agentAccent, type AgentStatus } from './chatStatus'

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
 * 多会话并行分屏：**同时**平铺所有选中会话，每块都是完整可交互的 Agent（各自 WS / 状态 / 弹窗），
 * 这才是「分屏并看」。顶部 Dashboard 概览（共几个 / 几个运行中 / 几个报错）提供全局态势；
 * 每块块头有区分色 + 状态点，报错块顶部红条突出。响应式栅格，每块≥320px 高、内部各自滚动。
 */
export function MultiSessionView({ sessionIds, onExit, onRemove }: Props) {
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({})

  // 子块上报状态：仅在实际变化时写入，避免无谓重渲染
  const setStatus = useCallback((id: string, s: AgentStatus) => {
    setStatuses(prev => {
      const old = prev[id]
      if (old && old.kind === s.kind && old.count === s.count && old.errorText === s.errorText) return prev
      return { ...prev, [id]: s }
    })
  }, [])

  const runningCount = sessionIds.filter(id => statuses[id]?.kind === 'running').length
  const errorCount = sessionIds.filter(id => statuses[id]?.kind === 'error').length

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Dashboard 概览条 */}
      <div className="flex items-center gap-3 border-b bg-[var(--color-muted)] px-3 py-1.5 text-xs">
        <span className="font-semibold">分屏并看</span>
        <span className="text-[var(--color-muted-foreground)]">
          {sessionIds.length} 个 Agent
          {runningCount > 0 && <span className="text-emerald-600 dark:text-emerald-400"> · {runningCount} 运行中</span>}
          {errorCount > 0 && <span className="text-red-600 dark:text-red-400"> · {errorCount} 报错</span>}
        </span>
        <Button variant="ghost" size="sm" className="ml-auto gap-1" onClick={onExit}>
          <X className="size-4" /> 退出分屏
        </Button>
      </div>

      {sessionIds.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
          没有选中的会话
        </div>
      ) : (
        <div
          className={`grid min-h-0 flex-1 gap-2 overflow-auto p-2 ${colsClass(sessionIds.length)}`}
          style={{ gridAutoRows: 'minmax(320px, 1fr)' }}
        >
          {sessionIds.map((id, i) => (
            <div key={id} className="min-h-0">
              <SessionPane
                sessionId={id}
                accent={agentAccent(i)}
                onStatus={s => setStatus(id, s)}
                onClose={() => onRemove(id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
