import { lazy } from 'react'
import { Workflow } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const ArchitectureHome = lazy(() => import('./pages/ArchitectureHome').then((m) => ({ default: m.ArchitectureHome })))
const VibeCodingArch = lazy(() => import('./pages/VibeCodingArch').then((m) => ({ default: m.VibeCodingArch })))
const FrontendPerfArch = lazy(() => import('./pages/FrontendPerfArch').then((m) => ({ default: m.FrontendPerfArch })))
const TeamVibeCoding = lazy(() => import('./pages/TeamVibeCoding').then((m) => ({ default: m.TeamVibeCoding })))
const VisitorAnalysisArch = lazy(() => import('./pages/VisitorAnalysisArch').then((m) => ({ default: m.VisitorAnalysisArch })))
const LlmMonitorArch = lazy(() => import('./pages/LlmMonitorArch').then((m) => ({ default: m.LlmMonitorArch })))
const manifest: FeatureManifest = {
  id: 'architecture',
  name: '实现原理',
  icon: Workflow,
  group: '参考',
  description: '各模块架构与实现原理的可视化深度说明（HTML 页）',
  order: 61,
  entry: '/tools/architecture',
  routes: [
    { path: '/tools/architecture', element: <ArchitectureHome /> },
    { path: '/tools/architecture/vibe-coding', element: <VibeCodingArch /> },
    { path: '/tools/architecture/frontend-perf', element: <FrontendPerfArch /> },
    { path: '/tools/architecture/team-vibe-coding', element: <TeamVibeCoding /> },
    { path: '/tools/architecture/visitor-analysis', element: <VisitorAnalysisArch /> },
    { path: '/tools/architecture/llm-monitor', element: <LlmMonitorArch /> },
  ],
}

export default manifest
