import { lazy } from 'react'
import { Database } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const DbConsolePage = lazy(() => import('./pages/DbConsolePage').then(module => ({
  default: module.DbConsolePage,
})))

const manifest: FeatureManifest = {
  id: 'db-console',
  name: 'DB Console',
  icon: Database,
  group: '项目开发',
  description: '轻量只读 SQL 工作台，复用团队数据源与查询历史',
  order: 60,
  routes: [{ path: '/tools/db-console', element: <DbConsolePage /> }],
}

export default manifest
