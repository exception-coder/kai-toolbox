import { describe, expect, it } from 'vitest'
import type { ChatItem } from '@/features/claude-chat/public-api'
import { isPublicReviewDisplayItem } from './publicReviewMessageVisibility'

describe('isPublicReviewDisplayItem', () => {
  it('只放行业务对话和必要提示', () => {
    const items: ChatItem[] = [
      { kind: 'user', id: 'u1', text: '业务问题' },
      { kind: 'assistant', id: 'a1', text: '业务回复' },
      { kind: 'warning', id: 'w1', code: 'SYNC', message: '消息可能未同步' },
      { kind: 'error', id: 'e1', code: 'FAILED', message: '回复失败' },
      { kind: 'tool', id: 't1', toolName: 'Read', input: { path: 'secret' } },
      { kind: 'activity', id: 'p1', activityType: 'tool', status: 'running', title: '读取文件' },
      { kind: 'result', id: 'r1', stopReason: 'success', usage: { output_tokens: 10 } },
    ]

    expect(items.filter(isPublicReviewDisplayItem).map(item => item.kind))
      .toEqual(['user', 'assistant', 'warning', 'error'])
  })
})
