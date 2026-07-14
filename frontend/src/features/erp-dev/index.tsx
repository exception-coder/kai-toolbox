import { lazy } from 'react'
import { Workflow } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const ErpDevPage = lazy(() => import('./pages/ErpDevPage').then((m) => ({ default: m.ErpDevPage })))

const manifest: FeatureManifest = {
  id: 'erp-dev',
  name: 'ERP 需求开发',
  icon: Workflow,
  group: 'AI',
  description: '填模块+需求，交给 ERP 自动开发 agent：定位代码→查知识图谱/库→出方案→按规范改码→出 diff（门控·只改不提交）',
  order: 51,
  routes: [{ path: '/tools/erp-dev', element: <ErpDevPage /> }],
}

export default manifest
