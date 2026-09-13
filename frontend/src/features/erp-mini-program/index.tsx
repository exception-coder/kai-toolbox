import { LegacyDevelopmentRedirect } from '@/features/project-development/public-api'
import { Smartphone } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const manifest: FeatureManifest = {
  id: 'erp-mini-program',
  chrome: true,
  name: 'ERP小程序',
  icon: Smartphone,
  group: '项目开发',
  description: 'ERP 小程序项目启停、开发上下文整理与需求开发会话入口',
  order: 52,
  routes: [{ path: '/tools/erp-mini-program', element: <LegacyDevelopmentRedirect system="erp-mini-program" /> }],
}

export default manifest
