// 工作线模块 feature manifest，遵循 featureRegistry 的自动注册约定
import { lazy } from 'react'
import { GitBranch } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const WorklinePage = lazy(() => import('./pages/WorklinePage').then((m) => ({ default: m.WorklinePage })))
const manifest: FeatureManifest = {
  id: 'workline',
  name: '工作线',
  icon: GitBranch,
  group: '内容',
  description: '按工作线记录核心工作内容与作出的成果，便于回顾与复盘',
  order: 26,
  routes: [{ path: '/tools/workline', element: <WorklinePage /> }],
}

export default manifest
