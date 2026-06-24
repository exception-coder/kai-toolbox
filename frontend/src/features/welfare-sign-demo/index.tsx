import { lazy } from 'react'
import { BadgeCheck } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const WelfareDemoPage = lazy(() =>
  import('./pages/WelfareDemoPage').then((m) => ({ default: m.WelfareDemoPage })),
)

const manifest: FeatureManifest = {
  id: 'welfare-sign-demo',
  name: '福利签收（免登录演示）',
  icon: BadgeCheck,
  group: '演示',
  description: '福利签收页免登录公开版 + 悬浮 Vibe Coding 对话框：免登录即可让 AI 受约束地改本页文案，即时反映',
  order: 90,
  layout: 'showcase',
  routes: [{ path: '/showcase/welfare-sign-demo', element: <WelfareDemoPage /> }],
}

export default manifest
