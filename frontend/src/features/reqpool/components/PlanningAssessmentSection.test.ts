import { describe, expect, it } from 'vitest'
import { describePlanningAssessmentFailure, formatPlanningDays, parsePlanningAssessmentPayload, parsePlanningEvidenceTrace, summarizePlanningEvidenceRoles } from './PlanningAssessmentSection'

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

describe('parsePlanningAssessmentPayload', () => {
  it('keeps the deterministic first test release estimate', () => {
    const payload = parsePlanningAssessmentPayload(JSON.stringify({
      criteriaVersion: 'initial-spec-planning-v4',
      effectiveHoursPerPersonDay: 6,
      summary: '先验证闭环',
      confidence: 'MEDIUM',
      assumptions: [],
      hoursMin: 30,
      hoursMax: 48,
      personDaysMin: 5,
      personDaysMax: 8,
      firstTestRelease: {
        scope: '测试环境可完成单笔业务闭环',
        capabilityIds: ['CAP-001'],
        acceptanceChecks: ['结果可查询'],
        deferredScope: ['批量操作'],
        confidence: 'HIGH',
        hoursMin: 12,
        hoursMax: 18,
        workingDaysMin: 2,
        workingDaysMax: 3,
      },
      capabilities: [],
    }))

    expect(payload?.firstTestRelease).toMatchObject({
      scope: '测试环境可完成单笔业务闭环',
      workingDaysMin: 2,
      workingDaysMax: 3,
    })
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

  it('accepts the v2 multi-project trace without requiring legacy project fields', () => {
    const trace = parsePlanningEvidenceTrace(JSON.stringify({
      version: 'planning-evidence-trace-v2',
      traceId: 'trace-1',
      primaryProject: 'yoooni-one',
      round: 2,
      maxRounds: 3,
      complete: true,
      sources: [{
        entryId: 'entry-1',
        source: 'DDL',
        sourceProject: 'yoooni',
        projectRole: 'LEGACY_SOURCE',
        relation: 'REFACTORS',
        attempted: true,
        status: 'NO_HIT',
        target: 'ddl-baseline.md',
        resultChars: 0,
        queryReason: '核验字段关系',
        excerpt: '',
      }],
    }))

    expect(trace?.primaryProject).toBe('yoooni-one')
    expect(trace?.sources[0]).toMatchObject({ sourceProject: 'yoooni', relation: 'REFACTORS', status: 'NO_HIT' })
  })

  it('summarizes current gaps separately from legacy evidence hits', () => {
    const trace = parsePlanningEvidenceTrace(JSON.stringify({
      version: 'planning-evidence-trace-v2',
      primaryProject: 'yoooni-one',
      sources: [
        { source: 'GRAPHIFY', sourceProject: 'yoooni-one', projectRole: 'CURRENT_IMPLEMENTATION', attempted: true, status: 'SOURCE_MISSING', target: '', resultChars: 0, excerpt: '' },
        { source: 'GRAPHIFY', sourceProject: 'yoooni', projectRole: 'LEGACY_SOURCE', attempted: true, status: 'HIT', target: 'graph.json', resultChars: 30, excerpt: 'OrderAction' },
        { source: 'DDL', sourceProject: 'yoooni', projectRole: 'LEGACY_SOURCE', attempted: true, status: 'HIT', target: 'ddl.md', resultChars: 40, excerpt: 'T_ORDER' },
      ],
    }))

    expect(summarizePlanningEvidenceRoles(trace!)).toEqual([
      expect.objectContaining({ project: 'yoooni-one', roleLabel: '当前实现', hitCount: 0, description: '代码图谱数据源缺失' }),
      expect.objectContaining({ project: 'yoooni', roleLabel: '遗留来源', hitCount: 2, description: '已命中 代码图谱、数据库 DDL' }),
    ])
  })
})
