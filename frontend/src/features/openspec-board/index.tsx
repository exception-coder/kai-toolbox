import { LegacyOpenSpecRedirect } from './public-api'
import { Columns3 } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const manifest: FeatureManifest = {
  id: 'openspec-board',
  name: '应用需求与任务',
  chrome: true,
  icon: Columns3,
  group: 'AI',
  description: '按项目、需求和任务查看 OpenSpec 研发进度',
  order: 50,
  routes: [{ path: '/tools/openspec-board', element: <LegacyOpenSpecRedirect /> }],
}

export default manifest
