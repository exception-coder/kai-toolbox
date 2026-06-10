import { lazy } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const ConfigCenterPage = lazy(() => import('./pages/ConfigCenterPage').then((m) => ({ default: m.ConfigCenterPage })))
const manifest: FeatureManifest = {
  id: 'config-center',
  name: '配置中心',
  icon: SlidersHorizontal,
  group: '系统工具',
  description: '在线编辑可刷新配置块（@Refreshable），不重启生效，重启保留',
  order: 6,
  routes: [{ path: '/tools/config-center', element: <ConfigCenterPage /> }],
}

export default manifest
