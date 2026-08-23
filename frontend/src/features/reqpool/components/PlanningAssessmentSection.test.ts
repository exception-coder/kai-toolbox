import { describe, expect, it } from 'vitest'
import { describePlanningAssessmentFailure, formatPlanningDays, parsePlanningEvidenceTrace } from './PlanningAssessmentSection'

describe('describePlanningAssessmentFailure', () => {
  it('translates the legacy scope validation error into a recoverable explanation', () => {
    expect(describePlanningAssessmentFailure('scope 不能为空且长度不能超过 1000')).toEqual({
      reason: '模型生成的领域功能缺少范围说明，或范围说明超过 1000 字。',
      recovery: '这是旧版运行结果。重新评估后，系统会根据校验原因自动纠正，最多尝试 3 次。',
    })
  })

  it('keeps the precise exhausted reason and explains the strict recovery', () => {
    const result = describePlanningAssessmentFailure(
      '系统已自动纠正 3 次仍未通过规划准则：第 1 个领域功能的范围说明（scope）缺失。',
    )

    expect(result.reason).toContain('第 1 个领域功能')
    expect(result.recovery).toContain('严格准则未被放宽')
  })
})

describe('formatPlanningDays', () => {
  it('keeps the leadership view concise without losing the range', () => {
    expect(formatPlanningDays(78)).toBe('78')
    expect(formatPlanningDays(230.666)).toBe('230.7')
  })
})

describe('parsePlanningEvidenceTrace', () => {
  it('keeps the routed project and per-source invocation result for regression', () => {
    const trace = parsePlanningEvidenceTrace(JSON.stringify({
      version: 'planning-evidence-trace-v1',
      project: 'yoooni-one',
      module: '新品进度',
      query: '新品进度管理',
      capturedAt: 1,
      sources: [{
        source: 'GRAPHIFY',
        attempted: true,
        status: 'HIT',
        target: 'D:/graphify-out/graph.json',
        resultChars: 42,
        excerpt: 'OrderAction -> OrderService',
      }],
    }))

    expect(trace?.project).toBe('yoooni-one')
    expect(trace?.sources[0]).toMatchObject({ source: 'GRAPHIFY', attempted: true, status: 'HIT' })
  })
})
