import { lazy } from 'react'
import { Bot } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const AgentManagementPage = lazy(() =>
  import('./pages/AgentManagementPage').then(module => ({ default: module.AgentManagementPage })),
)

const manifest: FeatureManifest = {
  id: 'agent-management',
  name: 'Agent 管理',
  icon: Bot,
  group: 'AI',
  description: '统一管理 Agent Registry、配置、评测、观测和版本发布',
  order: 57,
  routes: [{ path: '/tools/agent-management', element: <AgentManagementPage /> }],
}

export default manifest

