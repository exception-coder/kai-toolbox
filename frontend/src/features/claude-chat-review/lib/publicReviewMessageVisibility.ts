import type { ChatItem } from '@/features/claude-chat/public-api'

/** 公开计划评审只渲染业务对话和必要提示，技术过程留在内部审计。 */
export function isPublicReviewDisplayItem(item: ChatItem): boolean {
  return item.kind !== 'tool' && item.kind !== 'activity' && item.kind !== 'result'
}
