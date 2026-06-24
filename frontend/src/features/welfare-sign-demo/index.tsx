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
  description: '福利签收页的免登录公开版：无需登录即可打开「确认身份」对话框并完成签收（复用真实页面）',
  order: 90,
  layout: 'showcase',
  routes: [{ path: '/showcase/welfare-sign-demo', element: <WelfareDemoPage /> }],
}

export default manifest
