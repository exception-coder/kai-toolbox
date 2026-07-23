import { lazy } from 'react'
import { Users } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const AccountAdminPage = lazy(() => import('./pages/AccountAdminPage').then((m) => ({ default: m.AccountAdminPage })))
const manifest: FeatureManifest = {
  id: 'account-admin',
  name: '账号管理',
  icon: Users,
  group: '系统',
  description: '管理员管理账号、配置角色、分配 Forge 角色/部门、启停与重置密码',
  order: 7,
  routes: [{ path: '/tools/account-admin', element: <AccountAdminPage /> }],
}

export default manifest
