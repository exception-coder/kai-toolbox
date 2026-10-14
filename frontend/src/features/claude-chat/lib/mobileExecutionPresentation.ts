import type { ChatItem } from '../types'

/** 只读取当前轮最后一项仍在执行的活动耗时，不把历史轮次或无效值当作当前耗时。 */
export function currentActivityElapsed(items: ChatItem[]): number | null {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]
    if (item.kind === 'result' || item.kind === 'user') break
    if (item.kind !== 'activity' || !['inProgress', 'in_progress', 'running', 'pending', 'started'].includes(item.status)) continue
    const value = item.data && typeof item.data === 'object' && 'elapsedMs' in item.data ? item.data.elapsedMs : null
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
  }
  return null
}

/** 只收起普通过程；异常与需要关注的活动继续出现在消息流。 */
export function isRoutineExecution(item: ChatItem): boolean {
  return item.kind === 'activity' && ['tool', 'command', 'file', 'diff', 'turn', 'agent'].includes(item.activityType)
    && !['error', 'warning'].includes(item.severity ?? '')
    && ['inProgress', 'in_progress', 'running', 'pending', 'started', 'completed', 'success'].includes(item.status)
}

export function dockExecutionItems(items: ChatItem[], running: boolean): ChatItem[] {
  let start = 0
  for (let index = items.length - 1; index >= 0; index--) {
    if (items[index].kind === 'user' || (running && items[index].kind === 'result')) { start = index + 1; break }
  }
  return items.slice(start).filter(item => ['activity', 'tool', 'error', 'result'].includes(item.kind))
}

export function isExecutionDetail(item: ChatItem): boolean {
  return item.kind === 'tool' || (item.kind === 'activity'
    && ['tool', 'command', 'file', 'diff', 'turn', 'agent'].includes(item.activityType))
}

/** 成功收口的内部尝试不再被当作当前告警；仍可在完整链路中查看。 */
export function hasExecutionNotice(items: ChatItem[], running: boolean): boolean {
  const events = dockExecutionItems(items, running)
  const result = events.filter(item => item.kind === 'result').at(-1)
  if (result?.kind === 'result' && ['end_turn', 'success', 'completed', 'stop'].includes(result.stopReason.trim().toLowerCase())) return false
  return events.some(item => item.kind === 'tool' ? item.isError
    : item.kind === 'activity' && (['error', 'warning'].includes(item.severity ?? '') || ['failed', 'error'].includes(item.status)))
}

export function turnTextAtResult(items: ChatItem[], resultId: string): string {
  const resultIndex = items.findIndex(item => item.id === resultId)
  const replies: string[] = []
  for (let index = resultIndex - 1; index >= 0; index--) {
    const item = items[index]
    if (item.kind === 'user' || item.kind === 'result') break
    if (item.kind === 'assistant' && item.text.trim()) replies.unshift(item.text)
  }
  return replies.join('\n\n')
}
