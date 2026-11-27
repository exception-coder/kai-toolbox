import { describe, expect, it } from 'vitest'
import type { ChatItem } from '../types'
import { crossEngineReviewRows } from './crossEngineReview'

const tool = (id: string, output?: string): Extract<ChatItem, { kind: 'tool' }> => ({
  kind: 'tool', id: `tool-${id}`, toolCallId: id, toolName: 'shell',
  input: { command: 'python "C:/team/cross-engine-verification/scripts/review.py" run --activity-events' },
  output,
})
const event = (status: string, fields = {}) => 'forge.review.activity/v1 ' +
  JSON.stringify({ id: '1234567890abcdef1234567890abcdef', status, engine: 'deepseek', ...fields })

describe('cross-engine review timeline', () => {
  it('keeps review at the owning tool and shows the most recent supported status', () => {
    const review = tool('review')
    const activities: ChatItem[] = [
      { kind: 'activity', id: 'tool-activity-review', activityType: 'tool', status: 'running',
        title: 'Shell', data: { output: event('REQUESTED') + '\n' + event('RUNNING', { model: 'deepseek-v4-flash' }) } },
    ]
    expect(crossEngineReviewRows([review, ...activities], true).get(review.id))
      .toMatchObject({ state: 'RUNNING', engine: 'deepseek', model: 'deepseek-v4-flash' })
    const complete = tool('review', event('COMPLETED', { reviewStatus: 'FAIL', findingCount: 2 }))
    expect(crossEngineReviewRows([complete, ...activities], false).get(review.id))
      .toMatchObject({ state: 'COMPLETED', findingCount: 2 })
  })

  it('restores older CLI output and prevents an earlier unfinished review from looking active', () => {
    const older = tool('older', JSON.stringify({ primaryEngine: 'codex', verificationEngine: null,
      requestedEngine: 'deepseek', executionStatus: 'SKIPPED', reasonCode: 'HARNESS_UNAUTHORIZED', findings: [] }))
    const unresolved = tool('unresolved')
    const next = tool('new')
    const rows = crossEngineReviewRows([older, unresolved, { kind: 'user', id: 'next', text: 'Next task' }, next], true)
    expect(rows.get(older.id)).toMatchObject({ state: 'SKIPPED', engine: 'deepseek' })
    expect(rows.get(unresolved.id)?.state).toBe('UNKNOWN')
    expect(rows.get(next.id)?.state).toBe('REQUESTED')
  })

  it('leaves unrelated shell output and history reads as ordinary tool records', () => {
    const unrelated = { ...tool('other', event('COMPLETED')), input: { command: 'echo something' } }
    const history = { ...tool('history', event('COMPLETED')), input: 'python cross-engine-verification/scripts/review.py history' }
    const truncated = tool('truncated', event('RUNNING'))
    const rows = crossEngineReviewRows([unrelated, history, truncated], false)
    expect(rows.size).toBe(1)
    expect(rows.get(truncated.id)?.state).toBe('UNKNOWN')
  })
})
