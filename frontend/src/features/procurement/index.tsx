import { lazy } from 'react'
import { ScanSearch } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const ProcurementPage = lazy(() => import('./pages/ProcurementPage'))
const manifest: FeatureManifest = {
  id: 'procurement', name: '招采信息采集', icon: ScanSearch, group: '智能体', order: 35,
  description: '公开招采公告采集、原文解析与关键词规则管理', entry: '/tools/procurement',
  routes: [
    { path: '/tools/procurement', element: <ProcurementPage /> },
    { path: '/tools/procurement/notices', element: <ProcurementPage /> },
    { path: '/tools/procurement/sites', element: <ProcurementPage /> },
    { path: '/tools/procurement/rules', element: <ProcurementPage /> },
    { path: '/tools/procurement/structure', element: <ProcurementPage /> },
    { path: '/tools/procurement/links', element: <ProcurementPage /> },
    { path: '/tools/procurement/experiences', element: <ProcurementPage /> },
  ],
}
export default manifest
