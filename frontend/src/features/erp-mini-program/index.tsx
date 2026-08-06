import { lazy } from 'react'
import { Smartphone } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const ErpMiniProgramPage = lazy(() =>
  import('./pages/ErpMiniProgramPage').then((module) => ({ default: module.ErpMiniProgramPage })),
)

const manifest: FeatureManifest = {
  id: 'erp-mini-program',
  name: 'ERP小程序',
  icon: Smartphone,
  group: '项目开发',
  description: 'ERP 小程序项目启停、开发上下文整理与需求开发会话入口',
  order: 52,
  routes: [{ path: '/tools/erp-mini-program', element: <ErpMiniProgramPage /> }],
}

export default manifest
