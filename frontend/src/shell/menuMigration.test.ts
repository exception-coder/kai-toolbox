import { describe, expect, it } from 'vitest'
import { migrateVisibleMenus } from './menuMigration'

const manifests = [{ id: 'project-development', replacesMenus: ['erp-dev', 'srm-dev'] }]
describe('merged menu preferences', () => {
  it('迁移原可见入口且保留其他设置', () => {
    expect(migrateVisibleMenus(['erp-dev', 'srm-dev', 'other'], manifests)).toEqual(['other', 'project-development'])
  })
  it('不强行显示原本隐藏的入口', () => {
    expect(migrateVisibleMenus(['other'], manifests)).toEqual(['other'])
  })
  it('迁移后可再次隐藏且保持幂等', () => {
    expect(migrateVisibleMenus(['project-development'], manifests)).toEqual(['project-development'])
    expect(migrateVisibleMenus([], manifests)).toEqual([])
  })
})
