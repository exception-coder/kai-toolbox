import { describe, expect, it, vi } from 'vitest'
import type { PrdSessionView } from '@/features/prd-clarify/public-api'
import type { ReqItemView } from '../types'
import { buildReqpoolVibeSeed, buildRequirementHierarchy, decisionOf, effectiveInsight, excerpt, relativeTime } from './reqpoolPageModel'

function item(id: string, prdSessionId: string | null, status: ReqItemView['status'] = 'DRAFT'): ReqItemView {
  return { id, prdSessionId, status, title: id, createdAt: 1, updatedAt: 1 } as ReqItemView
}

describe('reqpool page model', () => {
  it('keeps revisions below their parent requirement', () => {
    const parent = item('parent', 'prd-parent')
    const child = item('child', 'prd-child')
    const sessions = new Map([
      ['prd-parent', { id: 'prd-parent', parentId: null } as PrdSessionView],
      ['prd-child', { id: 'prd-child', parentId: 'prd-parent' } as PrdSessionView],
    ])

    const hierarchy = buildRequirementHierarchy([parent, child], sessions)

    expect(hierarchy.roots).toEqual([parent])
    expect(hierarchy.childrenByItemId.get(parent.id)).toEqual([child])
  })

  it('does not use stale AI insight for investment decisions', () => {
    const stale = { ...item('stale', null, 'PRD_READY'), aiInsight: '{"priority":"HIGH"}', aiInsightStale: true }
    expect(effectiveInsight(stale)).toBeNull()
    expect(decisionOf(stale)).toBe('PLAN')
  })

  it('keeps the page agent inside the reqpool feature boundary', () => {
    const seed = buildReqpoolVibeSeed('调整字段')
    expect(seed).toContain('唯一允许修改：当前工作目录 frontend/src/features/reqpool')
    expect(seed).toContain('调整字段')
  })

  it('formats excerpts and relative timestamps deterministically', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'))
    expect(excerpt('  hello   world  ')).toBe('hello world')
    expect(relativeTime(new Date('2026-08-14T12:00:00Z').getTime())).toBe('1 天前')
    vi.useRealTimers()
  })
})
