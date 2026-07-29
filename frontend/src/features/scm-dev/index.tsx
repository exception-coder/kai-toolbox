import { lazy } from 'react'
import { Warehouse } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const ScmDevPage = lazy(() => import('./pages/ScmDevPage').then((m) => ({ default: m.ScmDevPage })))

const manifest: FeatureManifest = {
  id: 'scm-dev',
  name: 'SCM',
  icon: Warehouse,
  group: '项目开发',
  description: '填模块+需求，交给自动开发 agent（yoooni-erp-auto-dev 门控流水线）：定位代码→查库→出方案→改码→重启后查库回读验证→出 diff（门控·只改不提交）',
  order: 55,
  routes: [{ path: '/tools/scm-dev', element: <ScmDevPage /> }],
}

export default manifest
