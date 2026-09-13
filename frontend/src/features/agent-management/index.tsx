import { lazy } from 'react'
import { Bot } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { LegacyEvaluationRedirect } from './pages/LegacyEvaluationRedirect'

const AgentManagementPage = lazy(() =>
  import('./pages/AgentManagementPage').then(module => ({ default: module.AgentManagementPage })),
)

const manifest: FeatureManifest = {
  id: 'agent-management',
  name: 'Agent 管理',
  icon: Bot,
  group: 'AI',
  description: '集中管理 Agent、能力配置、回归评测、运行对比与版本发布',
  order: 57,
  routes: [
    { path: '/tools/agent-management', element: <AgentManagementPage /> },
    { path: '/tools/eval', element: <LegacyEvaluationRedirect /> },
  ],
}

export default manifest
