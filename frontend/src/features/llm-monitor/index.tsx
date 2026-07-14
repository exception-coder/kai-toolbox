import { lazy } from 'react'
import { Gauge } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)

const manifest: FeatureManifest = {
  id: 'llm-monitor',
  name: 'LLM 监控',
  icon: Gauge,
  group: '运维',
  description:
    '共享 LLM 网关可观测性：token/成本计量、调用链路追踪、配额水位与慢调用（对标 AgentScope）',
  order: 62,
  routes: [{ path: '/tools/llm-monitor', element: <DashboardPage /> }],
}

export default manifest
