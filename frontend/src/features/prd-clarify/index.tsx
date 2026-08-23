import { lazy } from 'react'
import { FileText } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const PrdClarifyPage = lazy(() =>
  import('./pages/PrdClarifyPage').then((m) => ({ default: m.PrdClarifyPage }))
)

const manifest: FeatureManifest = {
  id: 'prd-clarify',
  name: '规格探索',
  icon: FileText,
  group: 'AI',
  description: '探索需求，结合系统知识生成初始化规格并沉淀为核心规格',
  order: 55,
  routes: [{ path: '/tools/prd-clarify', element: <PrdClarifyPage /> }],
}

export default manifest
