import { lazy } from 'react'
import { FlaskConical } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const WelfareDemoPage = lazy(() =>
  import('./pages/WelfareDemoPage').then((m) => ({ default: m.WelfareDemoPage })),
)

const manifest: FeatureManifest = {
  id: 'welfare-sign-demo',
  name: '福利签收 · Vibe Coding 演示',
  icon: FlaskConical,
  group: '演示',
  description: '免登录体验受约束的 AI 改码：只能在一次性副本里改福利签收模块，真实环境零影响',
  order: 90,
  layout: 'showcase',
  routes: [{ path: '/showcase/welfare-sign-demo', element: <WelfareDemoPage /> }],
}

export default manifest
