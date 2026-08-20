import type { ChatItem } from '@/features/claude-chat/public-api'
import type { AssistantConversationMessage } from './types'

interface AssistantConversationStatusInput {
  connectionState: string
  running: boolean
  pending: boolean
  backgroundTaskCount: number
  queuedCount: number
  errorMessage: string | null
  messageCount: number
}

export function projectConversationMessages(
  items: ChatItem[],
  running: boolean,
): AssistantConversationMessage[] {
  const messages = items.flatMap<AssistantConversationMessage>(item => {
    if (item.kind === 'user') {
      return [{
        id: item.id,
        role: 'user',
        content: item.displayText ?? item.text,
        timestamp: item.ts,
      }]
    }
    if (item.kind === 'assistant' && item.text.trim()) {
      return [{ id: item.id, role: 'assistant', content: item.text, timestamp: item.ts }]
    }
    return []
  })
  let latestAssistantIndex = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant') {
      latestAssistantIndex = index
      break
    }
  }
  if (running && latestAssistantIndex >= 0) messages[latestAssistantIndex].streaming = true
  return messages
}

export function resolveConversationState(input: AssistantConversationStatusInput): string {
  if (input.errorMessage) return '助手暂不可用'
  if (input.connectionState === 'connecting') return '正在连接'
  if (input.pending) return '等待确认'
  if (input.running || input.backgroundTaskCount > 0) return '回复中'
  if (input.queuedCount > 0) return '消息待发送'
  if (input.connectionState === 'ready') return input.messageCount > 0 ? '已完成' : '已就绪'
  return '尚未连接'
}
