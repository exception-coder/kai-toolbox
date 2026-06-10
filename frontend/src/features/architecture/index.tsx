import { lazy } from 'react'
import { Workflow } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const ArchitectureHome = lazy(() => import('./pages/ArchitectureHome').then((m) => ({ default: m.ArchitectureHome })))
const VibeCodingArch = lazy(() => import('./pages/VibeCodingArch').then((m) => ({ default: m.VibeCodingArch })))
const manifest: FeatureManifest = {
  id: 'architecture',
  name: '实现原理',
  icon: Workflow,
  group: '学习/参考',
  description: '各模块架构与实现原理的可视化深度说明（HTML 页）',
  order: 61,
  entry: '/tools/architecture',
  routes: [
    { path: '/tools/architecture', element: <ArchitectureHome /> },
    { path: '/tools/architecture/vibe-coding', element: <VibeCodingArch /> },
  ],
}

export default manifest
