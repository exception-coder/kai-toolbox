import { lazy } from 'react'
import { Radar } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { LegacyDeliveryRedirect } from '@/features/delivery-center/public-api'
import { SystemResources } from '@/features/ops/public-api'

const ReqPoolPage = lazy(() =>
  import('./pages/ReqPoolPage').then((m) => ({ default: m.ReqPoolPage }))
)
const DeliveryHome = lazy(() => import('./applications/ApplicationDeliveryPage').then(m => ({ default: m.DeliveryHome })))
const ApplicationDeliveryPage = lazy(() => import('./applications/ApplicationDeliveryPage').then(m => ({ default: m.ApplicationDeliveryPage })))
const LegacyWorkspaceTasks = lazy(() => import('./applications/ApplicationDeliveryPage').then(m => ({ default: m.LegacyWorkspaceTasks })))

const manifest: FeatureManifest = {
  id: 'reqpool',
  name: 'AI 交付中心',
  icon: Radar,
  group: 'AI',
  description: '从需求登记到交付验收，统一查看项目、执行轨道与真实证据',
  order: 49,
  routes: [
    { path: '/tools/reqpool/resources', element: <SystemResources /> },
    { path: '/tools/reqpool', element: <DeliveryHome /> },
    { path: '/tools/reqpool/apps/:systemId', element: <ApplicationDeliveryPage /> },
    { path: '/tools/reqpool/requirements', element: <ReqPoolPage /> },
    { path: '/tools/reqpool/changes', element: <LegacyWorkspaceTasks /> },
    { path: '/tools/delivery-center', element: <LegacyDeliveryRedirect /> },
  ],
}

export default manifest
