import { lazy } from 'react'
import { PanelsTopLeft } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const ProjectDevelopmentPage = lazy(() => import('./ProjectDevelopmentPage').then(module => ({ default: module.ProjectDevelopmentPage })))

const manifest: FeatureManifest = {
  id: 'project-development',
  replacesMenus: ['erp-dev', 'erp-mini-program', 'srm-dev', 'scm-dev', 'kai-dev', 'new-devmodule'],
  name: '项目开发',
  icon: PanelsTopLeft,
  group: '项目开发',
  order: 51,
  entry: '/tools/project-development',
  description: '集中管理 ERP、ERP 小程序、SRM、SCM、Forge 开发环境与新增模块',
  routes: [{ path: '/tools/project-development', element: <ProjectDevelopmentPage /> }],
}
export default manifest
