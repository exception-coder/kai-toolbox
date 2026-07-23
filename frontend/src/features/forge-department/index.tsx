import { lazy } from 'react'
import { Network } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const DepartmentPage = lazy(() =>
  import('./pages/DepartmentPage').then((m) => ({ default: m.DepartmentPage })),
)

const manifest: FeatureManifest = {
  id: 'forge-department',
  name: '部门管理',
  icon: Network,
  group: '系统',
  description: '组织部门树维护（增删改、层级与排序）',
  order: 8,
  requiredPermission: 'forge:dept:menu',
  routes: [{ path: '/tools/forge-department', element: <DepartmentPage /> }],
}

export default manifest
