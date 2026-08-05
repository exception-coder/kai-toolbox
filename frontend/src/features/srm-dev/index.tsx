import { lazy } from 'react'
import { Handshake } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const SrmDevPage = lazy(() => import('./pages/SrmDevPage').then((m) => ({ default: m.SrmDevPage })))
const SrmDevTasksPage = lazy(() => import('./pages/SrmDevTasksPage').then((m) => ({ default: m.SrmDevTasksPage })))
const SrmDevTaskDetailPage = lazy(() => import('./pages/SrmDevTaskDetailPage').then((m) => ({ default: m.SrmDevTaskDetailPage })))

const manifest: FeatureManifest = {
  id: 'srm-dev',
  name: 'SRM',
  icon: Handshake,
  group: '项目开发',
  description: 'SRM 服务启停、启动日志、测试配置与开发任务台账（SQL 登记 + 配置变更）',
  order: 54,
  routes: [
    { path: '/tools/srm-dev', element: <SrmDevPage /> },
    { path: '/tools/srm-dev/tasks', element: <SrmDevTasksPage /> },
    { path: '/tools/srm-dev/tasks/:id', element: <SrmDevTaskDetailPage /> },
  ],
}

export default manifest
