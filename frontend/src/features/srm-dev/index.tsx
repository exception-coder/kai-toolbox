import { lazy } from 'react'
import { Handshake } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const SrmDevPage = lazy(() => import('./pages/SrmDevPage').then((m) => ({ default: m.SrmDevPage })))
const SrmDevTasksPage = lazy(() => import('./pages/SrmDevTasksPage').then((m) => ({ default: m.SrmDevTasksPage })))
const SrmDevTaskDetailPage = lazy(() => import('./pages/SrmDevTaskDetailPage').then((m) => ({ default: m.SrmDevTaskDetailPage })))

const manifest: FeatureManifest = {
  id: 'srm-dev',
  name: 'SRM需求开发',
  icon: Handshake,
  group: 'AI',
  description: '填模块+需求，交给自动开发 agent：定位代码→查知识图谱(project=srm)/库→出方案→按规范改码→自闭环验证(MySQL 只读回读 + 网关实发)→出 diff（门控·只改不提交）；另含开发任务台账（SQL 登记 + 配置变更）',
  order: 54,
  routes: [
    { path: '/tools/srm-dev', element: <SrmDevPage /> },
    { path: '/tools/srm-dev/tasks', element: <SrmDevTasksPage /> },
    { path: '/tools/srm-dev/tasks/:id', element: <SrmDevTaskDetailPage /> },
  ],
}

export default manifest
