import { lazy } from 'react'
import { Sparkles } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const ShowcaseDemoPage = lazy(() => import('./pages/ShowcaseDemoPage').then((m) => ({ default: m.ShowcaseDemoPage })))

// layout: 'showcase' → 路由脱离 AppShell，全屏渲染、公开免鉴权（见 App.tsx 分流）。
// 仍登记进 featureRegistry，故侧边栏可见、可被导航到；进入后即切到 ShowcaseLayout。
const manifest: FeatureManifest = {
  id: 'showcase',
  name: '展示页样例',
  icon: Sparkles,
  group: '展示',
  description: '全屏展示型布局样例（产品官网/信息图风，非后台风）',
  order: 5,
  layout: 'showcase',
  entry: '/showcase/demo',
  routes: [{ path: '/showcase/demo', element: <ShowcaseDemoPage /> }],
}

export default manifest
