import { lazy } from 'react'
import { PackagePlus } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const NewDevModulePage = lazy(() => import('./pages/NewDevModulePage').then((m) => ({ default: m.NewDevModulePage })))

const manifest: FeatureManifest = {
  id: 'new-devmodule',
  name: '新增系统需求开发模块',
  icon: PackagePlus,
  group: 'AI 工具',
  description: '可视化填新项目参数，一键触发脚手架(yoooni-devmodule-scaffold)在 kai-toolbox 生成一个"XX 需求开发"工作台模块',
  order: 53,
  routes: [{ path: '/tools/new-devmodule', element: <NewDevModulePage /> }],
}

export default manifest
