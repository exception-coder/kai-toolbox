import { LegacyDevelopmentRedirect } from '@/features/project-development/public-api'
import { Hammer } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const manifest: FeatureManifest = {
  id: 'kai-dev',
  chrome: true,
  name: 'Forge',
  icon: Hammer,
  group: '项目开发',
  description: 'Forge 前后端服务启停与启动日志',
  order: 52,
  routes: [{ path: '/tools/kai-dev', element: <LegacyDevelopmentRedirect system="kai-dev" /> }],
}

export default manifest
