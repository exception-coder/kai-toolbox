import { describe, expect, it } from 'vitest'
import { compressModuleContextSummary, resolveModuleIdentity } from './moduleContext'
import type { AssistantContextSnapshot } from './types'

describe('moduleContext', () => {
  it('prefers a declared route name as the stable module key', () => {
    expect(resolveModuleIdentity(snapshot({
      url: 'https://erp.example/orders/42?tab=a', routeName: 'order-detail',
    }))).toMatchObject({ moduleKey: 'order-detail', route: 'https://erp.example/orders/42?tab=a' })
  })

  it('normalizes dynamic URL segments when routeName is unavailable', () => {
    expect(resolveModuleIdentity(snapshot({
      url: 'https://erp.example/Orders/42?tab=a#history',
    }))?.moduleKey).toBe('/orders/:id')
  })

  it('keeps the summary deterministic and within the server limit', () => {
    const summary = compressModuleContextSummary(`开头\n${'x'.repeat(7_000)}\n结尾`)

    expect(summary).toHaveLength(6_000)
    expect(summary).toContain('[中间内容已压缩]')
    expect(summary.startsWith('开头')).toBe(true)
    expect(summary.endsWith('结尾')).toBe(true)
  })
})

function snapshot(page: AssistantContextSnapshot['page']): AssistantContextSnapshot {
  return {
    protocolVersion: '1.0', application: { appId: 'ERP', sourceRevision: 'v1' }, page,
    contributions: {}, unavailableProviders: [], capturedAt: 1,
  }
}
