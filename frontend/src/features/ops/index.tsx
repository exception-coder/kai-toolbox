import { lazy } from 'react'
import { DatabaseZap } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const OpsPage = lazy(() => import('./pages/OpsPage').then((m) => ({ default: m.OpsPage })))

const manifest: FeatureManifest = {
  id: 'ops',
  name: '系统与中间件',
  icon: DatabaseZap,
  group: '系统',
  description: '登记我负责的系统与各环境中间件，一键连上 MySQL / Oracle / Redis 执行查询排查',
  order: 6,
  routes: [{ path: '/tools/ops', element: <OpsPage /> }],
}

export default manifest
