import { Users } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { AccountAdminPage } from './pages/AccountAdminPage'

const manifest: FeatureManifest = {
  id: 'account-admin',
  name: '账号管理',
  icon: Users,
  group: '系统工具',
  description: '管理员管理账号、配置角色（含只读用户）、启停与重置密码',
  order: 7,
  routes: [{ path: '/tools/account-admin', element: <AccountAdminPage /> }],
}

export default manifest
