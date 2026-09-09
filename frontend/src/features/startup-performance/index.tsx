import { lazy } from 'react'
import { Timer } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const StartupPerformancePage = lazy(() => import('./pages/StartupPerformancePage'))
const manifest: FeatureManifest = {
  id: 'startup-performance',
  name: '启动性能治理',
  icon: Timer,
  group: '运维',
  order: 36,
  description: '分段观察构建与启动耗时，定位最慢初始化步骤',
  routes: [{ path: '/tools/startup-performance', element: <StartupPerformancePage /> }],
}
export default manifest
