import { describe, expect, it } from 'vitest'
import type { ChatItem } from '@/features/claude-chat/public-api'
import { projectConversationMessages, resolveConversationState } from './conversationProjection'

describe('assistant conversation projection', () => {
  const items: ChatItem[] = [
    { kind: 'user', id: 'u-1', text: '为什么无法审核？' },
    { kind: 'assistant', id: 'a-1', text: '## 原因\n\n请检查 **订单状态**。' },
  ]

  it('projects both user and assistant messages and marks only an active answer as streaming', () => {
    expect(projectConversationMessages(items, true)).toEqual([
      { id: 'u-1', role: 'user', content: '为什么无法审核？', timestamp: undefined },
      {
        id: 'a-1', role: 'assistant', content: '## 原因\n\n请检查 **订单状态**。',
        timestamp: undefined, streaming: true,
      },
    ])
  })

  it('moves to completed when streaming stops even when the answer text is unchanged', () => {
    const messages = projectConversationMessages(items, false)
    expect(resolveConversationState({
      connectionState: 'ready', running: false, pending: false,
      backgroundTaskCount: 0, queuedCount: 0, errorMessage: null,
      messageCount: messages.length,
    })).toBe('已完成')
    expect(messages[1].streaming).toBeUndefined()
  })

  it('keeps queued and error states explicit', () => {
    expect(resolveConversationState({
      connectionState: 'ready', running: false, pending: false,
      backgroundTaskCount: 0, queuedCount: 2, errorMessage: null, messageCount: 1,
    })).toBe('消息待发送')
    expect(resolveConversationState({
      connectionState: 'ready', running: false, pending: false,
      backgroundTaskCount: 0, queuedCount: 0, errorMessage: '连接失败', messageCount: 1,
    })).toBe('助手暂不可用')
  })
})
