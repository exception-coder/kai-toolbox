// 简历模块 feature manifest，遵循 featureRegistry 的自动注册约定
import { lazy } from 'react'
import { UserSquare2 } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const ResumePage = lazy(() => import('./pages/ResumePage').then((m) => ({ default: m.ResumePage })))
const manifest: FeatureManifest = {
  id: 'resume',
  name: '个人简历',
  icon: UserSquare2,
  group: '内容',
  description: '在线编辑个人简历：5 套模板 + 5 种主色，一键导出 PNG / PDF',
  order: 25,
  routes: [{ path: '/tools/resume', element: <ResumePage /> }],
}

export default manifest
