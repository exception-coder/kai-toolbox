import { lazy } from 'react'
import { Rocket } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const QuickLaunchPage = lazy(() => import('./pages/QuickLaunchPage').then(module => ({
  default: module.QuickLaunchPage,
})))

const manifest: FeatureManifest = {
  id: 'quick-launch',
  name: '快捷入口',
  icon: Rocket,
  group: '效率',
  description: '登记并快速打开常用工作站点、本地服务与管理平台',
  order: 1,
  routes: [{ path: '/tools/quick-launch', element: <QuickLaunchPage /> }],
}

export default manifest
