import { lazy } from 'react'
import { FileText } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const PrdClarifyPage = lazy(() =>
  import('./pages/PrdClarifyPage').then((m) => ({ default: m.PrdClarifyPage }))
)

const manifest: FeatureManifest = {
  id: 'prd-clarify',
  name: '规格工作台',
  icon: FileText,
  group: 'AI',
  description: 'AI 交付中心的深度规格工作区，用于兼容历史会话与直接链接',
  order: 55,
  chrome: true,
  routes: [{ path: '/tools/prd-clarify', element: <PrdClarifyPage /> }],
}

export default manifest
