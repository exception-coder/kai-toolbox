import { lazy } from 'react'
import { Hammer } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const KaiDevPage = lazy(() => import('./pages/KaiDevPage').then((m) => ({ default: m.KaiDevPage })))

const manifest: FeatureManifest = {
  id: 'kai-dev',
  name: 'Forge 开发',
  icon: Hammer,
  group: 'AI',
  description: '本工作台自身的开发模块：选目录+模块/需求，一键起停前后端服务并看前台日志（脚手架 dogfood 示例）',
  order: 52,
  routes: [{ path: '/tools/kai-dev', element: <KaiDevPage /> }],
}

export default manifest
