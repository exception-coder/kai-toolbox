import { describe, expect, it } from 'vitest'
import { buildMenuSyncPrompt, buildModuleScopePrompt } from './workspacePrompts'

describe('workspace prompts', () => {
  it('keeps module work scoped to verified frontend and backend paths', () => {
    const prompt = buildModuleScopePrompt({
      name: '订单中心',
      summary: '订单履约能力',
      webPath: 'frontend/orders',
      codePath: 'backend/orders',
    } as Parameters<typeof buildModuleScopePrompt>[0])

    expect(prompt).toContain('前端：frontend/orders')
    expect(prompt).toContain('后端：backend/orders')
    expect(prompt).toContain('先列出涉及了哪些外部类及原因')
    expect(prompt).toMatch(/需求：$/)
  })

  it('keeps menu synchronization behind an explicit owner apply gate', () => {
    const prompt = buildMenuSyncPrompt('demo', 'D:/demo', 'D:/knowledge')

    expect(prompt).toContain('禁止添加 --apply')
    expect(prompt).toContain('只有 owner 明确回复“--apply”')
    expect(prompt).toContain('不得套用 Yoooni 的 CRM_RIGHT 字段')
  })
})
