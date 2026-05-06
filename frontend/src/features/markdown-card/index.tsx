import { FileImage } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { MarkdownCardPage } from './pages/MarkdownCardPage'

const manifest: FeatureManifest = {
  id: 'markdown-card',
  name: 'Markdown 转卡片',
  icon: FileImage,
  group: '内容工具',
  description: '把 Markdown 文本转成可分享的图片卡片，三种模式 + 多主题，纯前端导出',
  order: 30,
  routes: [{ path: '/tools/markdown-card', element: <MarkdownCardPage /> }],
}

export default manifest
