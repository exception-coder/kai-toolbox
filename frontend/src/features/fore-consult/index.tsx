import { lazy } from 'react'
import { MessagesSquare } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const ForeConsultPage = lazy(() =>
  import('./pages/ForeConsultPage').then((m) => ({ default: m.ForeConsultPage }))
)

const manifest: FeatureManifest = {
  id: 'fore-consult',
  name: '业务系统咨询',
  icon: MessagesSquare,
  group: 'AI',
  description: '选定业务系统与模块，复用 Vibe Coding 会话以业务口吻答疑并归档引用',
  order: 56,
  routes: [{ path: '/tools/fore-consult', element: <ForeConsultPage /> }],
}

export default manifest
