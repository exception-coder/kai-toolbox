import { lazy } from 'react'
import { FolderGit2 } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage })))
const manifest: FeatureManifest = {
  id: 'projects',
  name: '项目管理',
  icon: FolderGit2,
  group: '系统',
  description: '扫描本地项目目录，一键跳转 Web 终端启动 claude',
  order: 5,
  routes: [{ path: '/tools/projects', element: <ProjectsPage /> }],
}

export default manifest
