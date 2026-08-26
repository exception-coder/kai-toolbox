import type { AssistantFeedbackCounts, AssistantFeedbackSession } from './types'

export function summarizeFeedbackCounts(sessions: AssistantFeedbackSession[]): AssistantFeedbackCounts {
  return sessions.reduce<AssistantFeedbackCounts>((total, session) => ({
    bug: total.bug + session.counts.bug,
    optimization: total.optimization + session.counts.optimization,
    requirement: total.requirement + session.counts.requirement,
  }), { bug: 0, optimization: 0, requirement: 0 })
}
