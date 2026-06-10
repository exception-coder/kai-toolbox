import { lazy } from 'react'
import { ListChecks } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const TaskCenterPage = lazy(() => import('./pages/TaskCenterPage').then((m) => ({ default: m.TaskCenterPage })))
const manifest: FeatureManifest = {
  id: 'task-center',
  name: '任务中心',
  icon: ListChecks,
  group: '系统工具',
  description: '查看正在进行的音频抽取 / 字幕转写 / 翻译 / 目录扫描任务并管理',
  order: 18,
  routes: [{ path: '/tools/tasks', element: <TaskCenterPage /> }],
}

export default manifest
