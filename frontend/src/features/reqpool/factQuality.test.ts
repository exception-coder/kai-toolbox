import { describe, expect, it } from 'vitest'

import type { ReqItemView } from './types'
import { evaluateRequirementFacts } from './factQuality'

function requirement(overrides: Partial<ReqItemView> = {}): ReqItemView {
  return {
    id: 'req-1',
    title: '需求',
    description: null,
    project: null,
    module: null,
    priority: 'MEDIUM',
    status: 'DRAFT',
    assignee: null,
    assigneeUserId: null,
    deadline: null,
    prdSessionId: null,
    tags: null,
    reqType: 'UNKNOWN',
    reqTypeSource: 'UNKNOWN',
    reqTypeConfidence: 0,
    aiInsight: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('evaluateRequirementFacts', () => {
  it('does not infer a requirement type from browser-side keywords', () => {
    const result = evaluateRequirementFacts(requirement({
      title: '订单提交报错',
      description: '当前提交订单时报错，期望修复后可以正常返回订单号。',
    }))

    expect(result.reqType).toBe('UNKNOWN')
    expect(result.reqTypeSource).toBe('UNKNOWN')
    expect(result.locationLabel).toContain('类型待判定')
  })

  it('gives a new module the documented location exemption', () => {
    const result = evaluateRequirementFacts(requirement({
      title: '新增供应商画像能力',
      description: '需要新增供应商画像能力，帮助采购人员识别风险。',
      reqType: 'NEW_MODULE',
      reqTypeSource: 'AI',
      reqTypeConfidence: 0.9,
    }))
    const location = result.criteria.find((item) => item.key === 'location')

    expect(result.reqType).toBe('NEW_MODULE')
    expect(location?.earned).toBe(20)
    expect(result.locationLabel).toBe('待归属 / 模块待创建')
  })

  it('uses a URL as page-level location evidence for an existing module change', () => {
    const result = evaluateRequirementFacts(requirement({
      title: '优化审批页面',
      description: '现有页面 https://example.test/approve 显示缓慢，期望优化加载速度。',
      reqType: 'MODULE_ADJUST',
      reqTypeSource: 'AI',
      reqTypeConfidence: 0.8,
    }))
    const location = result.criteria.find((item) => item.key === 'location')

    expect(result.reqType).toBe('MODULE_ADJUST')
    expect(location?.earned).toBe(22)
    expect(result.locationLabel).toBe('URL 反查系统 / URL 已定位')
  })

  it('keeps complete facts ready and sparse facts blocked', () => {
    const complete = evaluateRequirementFacts(requirement({
      title: '修复订单审批状态不刷新',
      reqType: 'BUG_FIX',
      reqTypeSource: 'AI',
      reqTypeConfidence: 0.95,
      project: 'ERP',
      module: '订单审批',
      description: [
        '当前采购人员在审批订单后页面仍显示待审批，导致每天约 20 条订单重复操作并阻塞发货。',
        '期望审批成功后 2 秒内显示已审批，并返回明确成功状态。',
        '- 验收：刷新页面后状态保持一致。',
        '- 验收：接口返回成功码且不得重复提交。',
        '范围仅限测试环境，兼容现有 API 字段和权限约束。',
        '复现截图与日志见附件，页面 https://example.test/orders/approve。',
      ].join('\n'),
    }))
    const sparse = evaluateRequirementFacts(requirement({ title: '想法' }))

    expect(complete.level).toBe('READY')
    expect(complete.grade).toBe('A')
    expect(sparse.level).toBe('BLOCKED')
    expect(sparse.grade).toBe('D')
    expect(sparse.deductions.length).toBeGreaterThan(0)
  })
})
