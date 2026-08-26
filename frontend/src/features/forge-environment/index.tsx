import { lazy } from 'react'
import { Blocks } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const ForgeEnvironmentPage = lazy(() =>
  import('./pages/ForgeEnvironmentPage').then((module) => ({ default: module.ForgeEnvironmentPage })),
)

const manifest: FeatureManifest = {
  id: 'forge-environment',
  name: 'Forge 环境',
  icon: Blocks,
  group: '系统',
  description: '研发环境检测与一键初始化',
  order: 7,
  requiredPermission: 'forge:environment:menu',
  routes: [{ path: '/tools/forge-environment', element: <ForgeEnvironmentPage /> }],
}

export default manifest
