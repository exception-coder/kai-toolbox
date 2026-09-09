import { describe, expect, it } from 'vitest'
import { buildAssistantDeveloperInstructions } from './prompt'

describe('assistant developer instructions', () => {
  it('preserves the evidence contract and serialized snapshot for queued messages', () => {
    const value = buildAssistantDeveloperInstructions('DIAGNOSE', {
      protocolVersion: '1.0',
      application: { appId: 'ERP' },
      page: { url: '/orders/1' },
      contributions: {},
      unavailableProviders: [],
      capturedAt: 1,
    })

    expect(value).toContain('DIAGNOSE')
    expect(value).toContain('已确认事实')
    expect(value).toContain('/orders/1')
    expect(value).toContain('不得直接登记正式需求')
    expect(value).toContain('普通业务问答不生成反馈草稿')
    expect(value).toContain('验收标准')
    expect(value).toContain('不能编造实现坐标')
  })
})
