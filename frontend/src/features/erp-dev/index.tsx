import { LegacyDevelopmentRedirect } from '@/features/project-development/public-api'
import { Workflow } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const manifest: FeatureManifest = {
  id: 'erp-dev',
  chrome: true,
  name: 'ERP',
  icon: Workflow,
  group: '项目开发',
  description: 'ERP 服务启停、启动日志、测试库连接与本地实例配置',
  order: 51,
  routes: [{ path: '/tools/erp-dev', element: <LegacyDevelopmentRedirect system="erp-dev" /> }],
}

export default manifest
