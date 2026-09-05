import { lazy } from 'react'
import { Columns3 } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const OpenSpecBoardPage = lazy(() =>
  import('./pages/OpenSpecBoardPage').then(module => ({ default: module.OpenSpecBoardPage })),
)

const manifest: FeatureManifest = {
  id: 'openspec-board',
  name: 'OpenSpec 看板',
  icon: Columns3,
  group: 'AI',
  description: '按项目、需求和任务查看 OpenSpec 研发进度',
  order: 50,
  routes: [{ path: '/tools/openspec-board', element: <OpenSpecBoardPage /> }],
}

export default manifest
