import { lazy } from 'react'
import { FlaskConical } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const EvalPage = lazy(() => import('./pages/EvalPage').then((m) => ({ default: m.EvalPage })))

const manifest: FeatureManifest = {
  id: 'eval',
  name: '回归评测',
  icon: FlaskConical,
  group: 'AI',
  description: '黄金集回归：断言引擎、提示词版本对比、pass→fail 退化清单',
  order: 57,
  routes: [{ path: '/tools/eval', element: <EvalPage /> }],
}

export default manifest
