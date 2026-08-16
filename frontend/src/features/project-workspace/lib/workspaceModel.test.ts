import { describe, expect, it } from 'vitest'
import type { ProjectModule } from '@/features/claude-chat/public-api'
import { buildLinkagePrompt, errorMessage, filterModuleTree, normalizePath } from './workspaceModel'

describe('workspace model', () => {
  it('groups collaboration modules by project', () => {
    const prompt = buildLinkagePrompt([
      { projectName: 'web', projectPath: 'D:/web', moduleName: '订单页', moduleRelPath: 'src/order', modulePath: 'D:/web/src/order' },
      { projectName: 'api', projectPath: 'D:/api', moduleName: '订单服务', moduleRelPath: 'src/order', modulePath: 'D:/api/src/order' },
    ])

    expect(prompt).toContain('- **web/**')
    expect(prompt).toContain('订单服务: `api/src/order`')
  })

  it('preserves parents when only a nested module matches', () => {
    const modules = [{
      name: '平台',
      relPath: '.',
      absPath: 'D:/platform',
      type: 'root',
      children: [{ name: '订单', relPath: 'orders', absPath: 'D:/platform/orders', type: 'service' }],
    }] as ProjectModule[]

    const result = filterModuleTree(modules, '订单')

    expect(result).toHaveLength(1)
    expect(result[0].children?.[0].name).toBe('订单')
  })

  it('normalizes paths and provides a stable fallback error', () => {
    expect(normalizePath('D:\\Work\\Demo\\')).toBe('d:/work/demo')
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('boom')).toBe('请求失败')
  })
})
