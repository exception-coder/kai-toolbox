import { describe, expect, it } from 'vitest'
import { buildProjectKnowledgePrompt, buildModuleScopePrompt } from './workspacePrompts'

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

  it('initializes knowledge in the selected project with shared suite rules', () => {
    const prompt = buildProjectKnowledgePrompt('demo', 'D:/demo')

    expect(prompt).toContain('team-standards:init-project-docs')
    expect(prompt).toContain('D:/demo')
    expect(prompt).toContain('待确认')
    expect(prompt).toContain('draw.io')
    expect(prompt).not.toMatch(/project-domain-knowledge|cross-topology|modules.json|--apply/)
  })
})
