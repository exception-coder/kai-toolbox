import { lazy } from 'react'
import { Radar } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const DeliveryCenterPage = lazy(() =>
  import('./pages/DeliveryCenterPage').then(module => ({ default: module.DeliveryCenterPage }))
)

const manifest: FeatureManifest = {
  id: 'delivery-center',
  name: 'AI 交付中心',
  icon: Radar,
  group: 'AI',
  description: '基于 PRD、TDD 与代码证据自动校准真实交付状态',
  order: 49,
  routes: [{ path: '/tools/delivery-center', element: <DeliveryCenterPage /> }],
}

export default manifest
