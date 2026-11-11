import type { ChatItem, TurnFailure } from '../types'

type Result = Extract<ChatItem, { kind: 'result' }>

export const FAILURE_LABELS: Record<TurnFailure['category'], string> = {
  quota: '额度或限流', context: '上下文超限', authentication: '鉴权失效', network: '服务或网络异常',
  request: '请求或工具错误', refusal: '请求被拒绝', limit: '达到执行上限', incomplete: '未确认完成', unknown: '原因待核对',
}

/** Old transcripts may lack native error codes. Do not infer a cause from assistant prose. */
export function resultFailure(item: Result): TurnFailure | null {
  const reason = item.stopReason.trim().toLowerCase()
  if (['success', 'end_turn', 'completed', 'stop', 'interrupted', 'cancelled', 'user_cancelled', 'user_paused', 'admission_rejected'].includes(reason)) return null
  if (item.failure && item.failure.category in FAILURE_LABELS) return item.failure
  const category = ['incomplete', 'queue_check_unconfirmed'].includes(reason) ? 'incomplete'
    : reason === 'error_max_budget_usd' ? 'quota'
      : ['error_max_turns', 'error_max_structured_output_retries'].includes(reason) ? 'limit' : 'unknown'
  return { category }
}

export function turnResultLabel(item: Result): string {
  const failure = resultFailure(item)
  if (failure) return `此轮未完成 · ${FAILURE_LABELS[failure.category]}`
  if (['interrupted', 'cancelled', 'user_cancelled'].includes(item.stopReason)) return '此轮已中断'
  if (item.stopReason === 'user_paused') return '此轮已暂停'
  if (item.stopReason === 'admission_rejected') return '未开始 · 会话忙'
  return '此轮已完成'
}

/** Recovery applies only to the last settled turn, never to a result preceding newer user work. */
export function latestSettledResult(items: ChatItem[]): Result | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.kind === 'user') return null
    if (item.kind === 'result') return item
  }
  return null
}
