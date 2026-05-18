import { BookOpen } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { DocViewerHome } from './pages/DocViewerHome'
import { DocViewerPage } from './pages/DocViewerPage'
import { LocalEditorPage } from './pages/LocalEditorPage'

const manifest: FeatureManifest = {
  id: 'doc-viewer',
  name: 'Markdown 文档浏览器',
  icon: BookOpen,
  group: '学习/参考',
  description: '浏览 GitHub 仓库或本地目录中的 markdown 文档，并支持就地编辑',
  order: 60,
  entry: '/tools/doc-viewer',
  routes: [
    { path: '/tools/doc-viewer', element: <DocViewerHome /> },
    // 本地目录编辑（更具体的路径在前，避开被 GitHub 路由吞掉）
    { path: '/tools/doc-viewer/local/:sourceId', element: <LocalEditorPage /> },
    { path: '/tools/doc-viewer/local/:sourceId/*', element: <LocalEditorPage /> },
    // GitHub 文档源
    { path: '/tools/doc-viewer/:sourceId', element: <DocViewerPage /> },
    { path: '/tools/doc-viewer/:sourceId/*', element: <DocViewerPage /> },
  ],
}

export default manifest
