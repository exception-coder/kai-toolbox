import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import type { BackgroundTaskInfo, ChatItem, ConnState } from '../types'
import { ThinkingIndicator, type ActiveTask } from './ThinkingIndicator'

interface Props {
  items: ChatItem[]
  running: boolean
  engineLabel: string
  turnTokens?: number
  connState?: ConnState
  backgroundTasks?: BackgroundTaskInfo[]
}

/** Persistent truth-based session status shown next to the composer, independent of scroll position. */
export function SessionWorkStatus({
  items,
  running,
  engineLabel,
  turnTokens = 0,
  connState = 'ready',
  backgroundTasks = [],
}: Props) {
  const activeTask = findActiveTask(items)

  if (running) {
    return (
      <div className="border-b border-blue-200 bg-blue-50/90 px-3 py-2 dark:border-blue-900 dark:bg-blue-950/70">
        <ThinkingIndicator
          engineLabel={engineLabel}
          tokens={turnTokens}
          connState={connState}
          activeTask={activeTask}
        />
      </div>
    )
  }

  if (backgroundTasks.length > 0) {
    return (
      <div
        className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/70 dark:text-amber-300"
        title={backgroundTasks.map(task => task.description || task.taskType).join('\n')}
      >
        <Loader2 className="size-3.5 shrink-0 animate-spin" />
        <span className="font-medium">后台任务进行中 · {backgroundTasks.length}</span>
        <span className="min-w-0 truncate opacity-80">· {backgroundTasks[0]?.description || backgroundTasks[0]?.taskType}</span>
      </div>
    )
  }

  const completedTurn = findCompletedTurn(items)
  if (!completedTurn) return null
  const completedNormally = ['end_turn', 'success', 'completed', 'stop']
    .includes(completedTurn.stopReason.trim().toLowerCase())
  const interrupted = completedTurn.stopReason.trim().toLowerCase() === 'interrupted'
  return (
    <div className={`flex items-center gap-1.5 border-b px-3 py-1.5 text-xs ${completedNormally
      ? 'border-[var(--color-border)] text-[var(--color-muted-foreground)]'
      : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300'}`}>
      {completedNormally
        ? <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        : <AlertTriangle className="size-3.5 shrink-0" />}
      <span>{completedNormally
        ? '本轮正常结束 · 当前没有后台作业'
        : interrupted ? '本轮已中断 · 待发送队列不会自动继续' : '本轮异常结束 · 待发送队列不会自动继续'}</span>
    </div>
  )
}

function findActiveTask(items: ChatItem[]): ActiveTask | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (item.kind === 'result') break
    if (item.kind !== 'activity' || !isRunningStatus(item.status)) continue
    const data = item.data && typeof item.data === 'object' && !Array.isArray(item.data)
      ? item.data as Record<string, unknown>
      : undefined
    return {
      id: item.id,
      title: item.title,
      detail: item.detail,
      elapsedMs: typeof data?.elapsedMs === 'number' ? data.elapsedMs : undefined,
    }
  }
  return null
}

function findCompletedTurn(items: ChatItem[]): Extract<ChatItem, { kind: 'result' }> | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (item.kind === 'result') return item
    if (item.kind === 'user') return null
  }
  return null
}

function isRunningStatus(status: string): boolean {
  return status === 'inProgress' || status === 'in_progress' || status === 'running'
    || status === 'pending' || status === 'started'
}
