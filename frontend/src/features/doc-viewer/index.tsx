import { BookOpen } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { DocViewerHome } from './pages/DocViewerHome'
import { DocViewerPage } from './pages/DocViewerPage'

const manifest: FeatureManifest = {
  id: 'doc-viewer',
  name: 'GitHub 文档浏览器',
  icon: BookOpen,
  group: '学习/参考',
  description: '粘贴 GitHub 仓库地址，浏览其中的 markdown 文档目录树',
  order: 60,
  entry: '/tools/doc-viewer',
  routes: [
    { path: '/tools/doc-viewer', element: <DocViewerHome /> },
    { path: '/tools/doc-viewer/:sourceId', element: <DocViewerPage /> },
    { path: '/tools/doc-viewer/:sourceId/*', element: <DocViewerPage /> },
  ],
}

export default manifest
