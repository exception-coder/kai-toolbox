import type { PublicReviewRequirement } from '@/features/claude-chat/public-api'
import { reviewRequirementSourceId } from './reviewMessageIntent'

export function requirementText(title: string, content: string): string {
  return `## ${title.trim()}\n\n${content.trim()}`
}

export function requirementListText(items: Array<Pick<PublicReviewRequirement, 'title' | 'content'>>): string {
  if (items.length === 0) return '# 计划评审需求清单\n\n当前没有保留的有效需求。'
  return `# 计划评审需求清单\n\n${items.map((item, index) =>
    `## ${index + 1}. ${item.title.trim()}\n\n${item.content.trim()}`).join('\n\n')}`
}

export function requirementSubmissionId(item: Pick<PublicReviewRequirement, 'title' | 'content'>): string {
  return reviewRequirementSourceId(requirementText(item.title, item.content))
}
