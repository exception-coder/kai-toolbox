import { lazy } from 'react'
import { TableProperties } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const ReqPoolPage = lazy(() =>
  import('./pages/ReqPoolPage').then((m) => ({ default: m.ReqPoolPage }))
)

const manifest: FeatureManifest = {
  id: 'reqpool',
  name: 'AI 需求中枢',
  icon: TableProperties,
  group: 'AI',
  description: '统一登记、统一判定，基于 PRD/TDD/代码证据自动同步真实进度',
  order: 53,
  routes: [{ path: '/tools/reqpool', element: <ReqPoolPage /> }],
}

export default manifest
