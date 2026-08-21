import type { ChatItem } from '../types'

const MAX_INITIAL_SPEC_LENGTH = 6_000
const MAX_CONVERSATION_LENGTH = 16_000

function messageText(item: ChatItem): string {
  if (item.kind !== 'user' && item.kind !== 'assistant') return ''
  return (item.kind === 'user' ? item.displayText ?? item.text : item.text).trim()
}

export function initialReviewSpecification(items: ChatItem[], fallback: string): string {
  const requirements = items
    .filter((item): item is Extract<ChatItem, { kind: 'user' }> => item.kind === 'user')
    .map(messageText)
    .filter(Boolean)
    .slice(-8)
  return (requirements.length > 0 ? requirements.map(text => `- ${text}`).join('\n') : fallback.trim())
    .slice(0, MAX_INITIAL_SPEC_LENGTH)
}

export function buildReviewContextSnapshot(input: {
  systemName: string
  moduleName: string
  initialSpecification: string
  items: ChatItem[]
}): string {
  const conversation = input.items
    .filter(item => item.kind === 'user' || item.kind === 'assistant')
    .slice(-24)
    .map(item => `${item.kind === 'user' ? '业务方' : 'AI'}：${messageText(item)}`)
    .filter(line => !line.endsWith('：'))
    .join('\n\n')
    .slice(-MAX_CONVERSATION_LENGTH)
  return [
    '## 评审对象',
    `系统：${input.systemName.trim()}`,
    `模块：${input.moduleName.trim()}`,
    '',
    '## 当前需求初始规格',
    input.initialSpecification.trim(),
    '',
    '## 近期需求与方案上下文',
    conversation || '（暂无补充对话）',
  ].join('\n')
}
