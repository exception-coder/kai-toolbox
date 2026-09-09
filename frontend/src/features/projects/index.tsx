import { Navigate } from 'react-router-dom'
import { FolderGit2 } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const manifest: FeatureManifest = {
  id: 'projects',
  name: '项目管理',
  icon: FolderGit2,
  group: '系统',
  description: '扫描本地项目目录，一键跳转 Web 终端启动 claude',
  order: 5,
  chrome: true,
  routes: [{ path: '/tools/projects', element: <Navigate to="/tools/project-workspace?section=local" replace /> }],
}

export default manifest
