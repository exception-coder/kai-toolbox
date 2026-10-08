import { describe, expect, it, vi } from 'vitest'

// A metadata lookup must not evaluate page UI, including through re-export barrels.
vi.mock('@/features/delivery-center/components/DeliveryStageDialog', () => {
  throw new Error('交付弹窗不应阻塞菜单注册')
})
vi.mock('@/features/ops/components/SqlConsole', () => {
  throw new Error('SQL 控制台不应阻塞菜单注册')
})
vi.mock('@/features/claude-chat/components/MessageList', () => {
  throw new Error('消息列表不应阻塞菜单注册')
})

describe('startup feature registry', () => {
  it('registers navigation and legacy routes without loading unrelated page UI', async () => {
    const { features, featureAtPath } = await import('./featureRegistry')

    expect(featureAtPath('/tools/claude-chat')?.id).toBe('claude-chat')
    expect(featureAtPath('/tools/reqpool/resources')?.id).toBe('reqpool')
    expect(featureAtPath('/tools/ops')?.id).toBe('ops')
    expect(featureAtPath('/tools/delivery-center')?.id).toBe('reqpool')
    expect(features.find(feature => feature.id === 'reqpool')?.icon).toBeDefined()
    expect(features.every(feature => feature.routes.length > 0)).toBe(true)
  })
})
