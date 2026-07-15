import { lazy } from 'react'
import { FileText } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const PrdClarifyPage = lazy(() =>
  import('./pages/PrdClarifyPage').then((m) => ({ default: m.PrdClarifyPage }))
)

const manifest: FeatureManifest = {
  id: 'prd-clarify',
  name: 'PRD 澄清助手',
  icon: FileText,
  group: 'AI',
  description: '多轮澄清需求，用 Claude 自动生成结构化 PRD 文档',
  order: 55,
  routes: [{ path: '/tools/prd-clarify', element: <PrdClarifyPage /> }],
}

export default manifest
