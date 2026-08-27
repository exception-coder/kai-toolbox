import { lazy } from 'react'
import { Route } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const SystemRouteInspectorPage = lazy(() => import('./pages/SystemRouteInspectorPage').then((module) => ({
  default: module.SystemRouteInspectorPage,
})))

const manifest: FeatureManifest = {
  id: 'system-route-inspector',
  name: '系统路由检测',
  icon: Route,
  group: 'AI',
  description: '校验项目、模块、URL 与源码、知识图谱、关联项目及运行时 Tool 的完整路由',
  order: 52,
  routes: [{ path: '/tools/system-route-inspector', element: <SystemRouteInspectorPage /> }],
}

export default manifest
