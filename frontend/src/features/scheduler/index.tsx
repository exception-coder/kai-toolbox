import { lazy } from 'react'
import { TimerReset } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const SchedulerPage = lazy(() => import('./pages/SchedulerPage').then((m) => ({ default: m.SchedulerPage })))

const manifest: FeatureManifest = {
  id: 'scheduler',
  name: '调度中心',
  icon: TimerReset,
  group: '系统',
  description: '观察 Spring 定时任务，管理增强任务的运行计划与执行历史',
  order: 19,
  routes: [{ path: '/tools/scheduler', element: <SchedulerPage /> }],
}

export default manifest
