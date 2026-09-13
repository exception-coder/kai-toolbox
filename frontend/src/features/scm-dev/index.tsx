import { LegacyDevelopmentRedirect } from '@/features/project-development/public-api'
import { Warehouse } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const manifest: FeatureManifest = {
  id: 'scm-dev',
  chrome: true,
  name: 'SCM',
  icon: Warehouse,
  group: '项目开发',
  description: 'SCM 服务启停、启动日志与测试库配置',
  order: 55,
  routes: [{ path: '/tools/scm-dev', element: <LegacyDevelopmentRedirect system="scm-dev" /> }],
}

export default manifest
