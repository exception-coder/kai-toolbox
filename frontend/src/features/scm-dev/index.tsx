import { lazy } from 'react'
import { Warehouse } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const ScmDevPage = lazy(() => import('./pages/ScmDevPage').then((m) => ({ default: m.ScmDevPage })))

const manifest: FeatureManifest = {
  id: 'scm-dev',
  name: 'SCM',
  icon: Warehouse,
  group: '项目开发',
  description: 'SCM 服务启停、启动日志与测试库配置',
  order: 55,
  routes: [{ path: '/tools/scm-dev', element: <ScmDevPage /> }],
}

export default manifest
