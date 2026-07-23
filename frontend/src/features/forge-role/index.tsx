import { lazy } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const RolePage = lazy(() => import('./pages/RolePage').then((m) => ({ default: m.RolePage })))

const manifest: FeatureManifest = {
  id: 'forge-role',
  name: '角色管理',
  icon: ShieldCheck,
  group: '系统',
  description: '角色维护与权限码分配（按模块分组勾选）',
  order: 9,
  requiredPermission: 'forge:role:menu',
  routes: [{ path: '/tools/forge-role', element: <RolePage /> }],
}

export default manifest
