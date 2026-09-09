import { lazy } from 'react'
import { FolderTree } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const ProjectWorkspacePage = lazy(() => import('./pages/ProjectWorkspacePage').then((m) => ({ default: m.ProjectWorkspacePage })))
const ProjectRegistryPage = lazy(() => import('./registry/ProjectRegistryPage').then(m => ({ default: m.ProjectRegistryPage })))
const RegistryProjectDetailPage = lazy(() => import('./registry/RegistryProjectDetailPage').then(m => ({ default: m.RegistryProjectDetailPage })))
const manifest: FeatureManifest = {
  id: 'project-workspace',
  name: '项目库',
  icon: FolderTree,
  group: 'AI',
  description: '集中登记系统，执行 AI 初始化，围绕 System Profile 管理任务与验证',
  order: 51,
  routes: [
    { path: '/tools/project-workspace', element: <ProjectRegistryPage /> },
    { path: '/tools/project-workspace/modules', element: <ProjectWorkspacePage /> },
    { path: '/tools/project-workspace/:projectId', element: <RegistryProjectDetailPage /> },
  ],
}

export default manifest
