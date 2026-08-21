import type { ChatItem } from '@/features/claude-chat/public-api'

export type ReviewMessageIntent = 'REQUIREMENT' | 'CONSULTATION' | 'UNCLASSIFIED' | 'PENDING'

export interface ReviewTurn {
  userItem: Extract<ChatItem, { kind: 'user' }>
  assistantItems: Extract<ChatItem, { kind: 'assistant' }>[]
  intent: ReviewMessageIntent
  assistantText: string
  completed: boolean
}

export interface ReviewRequirement {
  sourceMessageId: string
  title: string
  content: string
  text: string
  sourceText: string
  analysisText: string
  ts: number
}

export const INTERNAL_SUMMARY_PREFIX = '[[FORGE_REVIEW_SUMMARY_REQUEST_V1]]'
export const PENDING_REQUIREMENT_NOTICE = '> **待确认需求**：业务诉求仍有歧义，已先加入清单。请核对后修改保存，或删除这条需求。'

const INTENT_MARKER = /\s*<!-- forge-review-intent:(REQUIREMENT|CONSULTATION) -->\s*$/
const ANY_VALID_INTENT_MARKER = /\s*<!-- forge-review-intent:(?:REQUIREMENT|CONSULTATION) -->\s*/g

export function parseReviewIntent(text: string): { intent: Exclude<ReviewMessageIntent, 'PENDING'>; text: string } {
  const match = text.match(INTENT_MARKER)
  return {
    intent: match?.[1] === 'REQUIREMENT' || match?.[1] === 'CONSULTATION' ? match[1] : 'UNCLASSIFIED',
    text: text.replace(ANY_VALID_INTENT_MARKER, '').trim(),
  }
}

export function stripReviewIntentMarker(text: string): string {
  return text.replace(ANY_VALID_INTENT_MARKER, '').trim()
}

/** 将一个用户轮次内可能被工具调用拆开的多段 AI 文本合并后再判定。 */
export function projectReviewTurns(
  items: ChatItem[],
  reviewCreatedAt: number,
  includeUndated: boolean,
): ReviewTurn[] {
  const turns: ReviewTurn[] = []
  let userItem: Extract<ChatItem, { kind: 'user' }> | null = null
  let assistantItems: Extract<ChatItem, { kind: 'assistant' }>[] = []

  const finish = (completed: boolean) => {
    if (!userItem) return
    const assistantRaw = assistantItems.map(item => item.text).filter(Boolean).join('\n\n')
    const parsed = parseReviewIntent(assistantRaw)
    const structuredIntent = userItem.reviewIntent?.intent === 'UNKNOWN'
      ? userItem.reviewIntent.classificationStatus === 'MISSING' ? 'PENDING' : 'UNCLASSIFIED'
      : userItem.reviewIntent?.intent
    const resolvedIntent = structuredIntent ?? parsed.intent
    const intent = resolvedIntent === 'UNCLASSIFIED' && !completed ? 'PENDING' : resolvedIntent
    const assistantText = userItem.reviewIntent?.extractedContent?.trim() || parsed.text
    turns.push({ userItem, assistantItems, intent, assistantText, completed })
    userItem = null
    assistantItems = []
  }

  for (const item of items) {
    if (item.kind === 'user') {
      finish(false)
      if (item.text.startsWith(INTERNAL_SUMMARY_PREFIX)) continue
      if (item.ts == null && !includeUndated) continue
      if (item.ts != null && item.ts < reviewCreatedAt) continue
      userItem = item
      continue
    }
    if (!userItem) continue
    if (item.kind === 'assistant') assistantItems.push(item)
    if (item.kind === 'result' || item.kind === 'error') finish(true)
  }
  finish(false)
  return turns
}

/** 优先使用持久化消息来源生成稳定指纹；旧历史缺少来源时才回退到内容指纹。 */
export function reviewRequirementSourceId(text: string, stableMessageId?: string): string {
  const normalizedStableId = stableMessageId?.trim()
  const normalized = normalizedStableId ? `message:${normalizedStableId}` : text.trim()
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  return `assistant-content-v1:${(first >>> 0).toString(36)}:${(second >>> 0).toString(36)}:${normalized.length}`
}

export function requirementsFromTurns(turns: ReviewTurn[], reviewCreatedAt: number): ReviewRequirement[] {
  const requirements = new Map<string, ReviewRequirement>()
  for (const turn of turns) {
    if (!turn.completed || turn.intent === 'CONSULTATION' || turn.intent === 'PENDING') continue
    const userText = (turn.userItem.displayText ?? turn.userItem.text).trim()
    const assistantText = turn.assistantText.trim()
    const titleMatch = assistantText.match(/^#{1,4}\s*需求标题[：:]\s*(.+)$/m)
    const fallbackTitle = (userText || '附件需求').split(/\r?\n/)[0].trim().slice(0, 120)
    const title = (titleMatch?.[1]?.trim() || fallbackTitle || '待确认需求').slice(0, 120)
    const analyzedContent = (titleMatch ? assistantText.replace(titleMatch[0], '').trim() : assistantText)
      || `## 需求说明\n\n${userText || '业务人员提交了附件，请结合原消息确认需求。'}`
    const content = turn.intent === 'UNCLASSIFIED'
      ? `${PENDING_REQUIREMENT_NOTICE}\n\n${analyzedContent}`
      : analyzedContent
    const material = `业务人员提出：\n${userText || '（业务人员提交了附件）'}\n\nAI 业务分析：\n${content}`.trim()
    const sourceMessageId = reviewRequirementSourceId(material, turn.userItem.reviewIntent?.sourceMessageId)
    const ts = turn.userItem.ts ?? turn.assistantItems[0]?.ts ?? reviewCreatedAt
    const existing = requirements.get(sourceMessageId)
    if (!existing || ts < existing.ts) {
      requirements.set(sourceMessageId, {
        sourceMessageId,
        title,
        content,
        text: material,
        sourceText: userText || '业务人员提交了附件',
        analysisText: content,
        ts,
      })
    }
  }
  return [...requirements.values()].sort((left, right) => left.ts - right.ts)
}
