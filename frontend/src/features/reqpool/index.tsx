import { lazy } from 'react'
import { Sparkles } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const ReqPoolPage = lazy(() =>
  import('./pages/ReqPoolPage').then((m) => ({ default: m.ReqPoolPage }))
)

const manifest: FeatureManifest = {
  id: 'reqpool',
  name: 'Requirements',
  icon: Sparkles,
  group: 'AI',
  description: '表达想法，AI 自动澄清需求、生成 PRD，驱动开发',
  order: 53,
  routes: [{ path: '/tools/reqpool', element: <ReqPoolPage /> }],
}

export default manifest
