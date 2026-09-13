import { describe, expect, it } from 'vitest'
import { PanelsTopLeft } from 'lucide-react'
import { hasFeatureAccess } from './access'
import type { FeatureManifest } from './types'

const feature: FeatureManifest = { id: 'project-development', name: '项目开发', icon: PanelsTopLeft,
  replacesMenus: ['erp-dev', 'srm-dev'], requiredPermission: 'menu:project-development', routes: [] }
describe('合并入口权限', () => {
  it('保留原系统授权的入口访问', () => {
    expect(hasFeatureAccess(feature, { roles: [], permissionCodes: ['menu:srm-dev'], superAdmin: false })).toBe(true)
  })
  it('无相关权限不能进入合并入口', () => {
    expect(hasFeatureAccess(feature, { roles: [], permissionCodes: ['menu:ai-chat'], superAdmin: false })).toBe(false)
  })
  it('合并入口不改变其他模块门禁', () => {
    expect(hasFeatureAccess({ ...feature, replacesMenus: undefined }, { roles: [], permissionCodes: ['menu:srm-dev'], superAdmin: false })).toBe(false)
  })
})
