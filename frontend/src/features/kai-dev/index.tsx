import { lazy } from 'react'
import { Hammer } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const KaiDevPage = lazy(() => import('./pages/KaiDevPage').then((m) => ({ default: m.KaiDevPage })))

const manifest: FeatureManifest = {
  id: 'kai-dev',
  name: 'Forge',
  icon: Hammer,
  group: '项目开发',
  description: 'Forge 前后端服务启停与启动日志',
  order: 52,
  routes: [{ path: '/tools/kai-dev', element: <KaiDevPage /> }],
}

export default manifest
