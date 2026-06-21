import { lazy } from 'react'
import { FolderTree } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const ProjectWorkspacePage = lazy(() => import('./pages/ProjectWorkspacePage').then((m) => ({ default: m.ProjectWorkspacePage })))
const manifest: FeatureManifest = {
  id: 'project-workspace',
  name: '项目工作台',
  icon: FolderTree,
  group: 'AI 工具',
  description: '选项目自动扫模块，每个模块一键进入对应的 Vibe Coding 会话（复用 claude-chat 能力）',
  order: 51,
  routes: [{ path: '/tools/project-workspace', element: <ProjectWorkspacePage /> }],
}

export default manifest
