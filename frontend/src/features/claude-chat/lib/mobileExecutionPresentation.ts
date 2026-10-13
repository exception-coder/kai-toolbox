import type { ChatItem } from '../types'

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
