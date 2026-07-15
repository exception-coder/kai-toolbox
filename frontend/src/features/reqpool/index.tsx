import { lazy } from 'react'
import { Layers } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const ReqPoolPage = lazy(() =>
  import('./pages/ReqPoolPage').then((m) => ({ default: m.ReqPoolPage }))
)

const manifest: FeatureManifest = {
  id: 'reqpool',
  name: '需求管理池',
  icon: Layers,
  group: 'AI',
  description: '统一管理产品需求，驱动 PRD 澄清与工作台开发的完整闭环',
  order: 53,
  routes: [{ path: '/tools/reqpool', element: <ReqPoolPage /> }],
}

export default manifest
