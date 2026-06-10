import { Workflow } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { ArchitectureHome } from './pages/ArchitectureHome'
import { VibeCodingArch } from './pages/VibeCodingArch'

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
