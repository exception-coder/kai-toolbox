import { lazy } from 'react'
import { Radar } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { LegacyDeliveryRedirect } from '@/features/delivery-center/public-api'

const ReqPoolPage = lazy(() =>
  import('./pages/ReqPoolPage').then((m) => ({ default: m.ReqPoolPage }))
)

const manifest: FeatureManifest = {
  id: 'reqpool',
  name: 'AI 交付中心',
  icon: Radar,
  group: 'AI',
  description: '从需求登记到交付验收，统一查看项目、执行轨道与真实证据',
  order: 49,
  routes: [
    { path: '/tools/reqpool', element: <ReqPoolPage /> },
    { path: '/tools/delivery-center', element: <LegacyDeliveryRedirect /> },
  ],
}

export default manifest
