import { lazy } from 'react'
import { Workflow } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const ErpDevPage = lazy(() => import('./pages/ErpDevPage').then((m) => ({ default: m.ErpDevPage })))

const manifest: FeatureManifest = {
  id: 'erp-dev',
  name: 'ERP',
  icon: Workflow,
  group: '项目开发',
  description: 'ERP 服务启停、启动日志、测试库连接与本地实例配置',
  order: 51,
  routes: [{ path: '/tools/erp-dev', element: <ErpDevPage /> }],
}

export default manifest
