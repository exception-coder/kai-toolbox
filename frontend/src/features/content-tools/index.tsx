import { lazy } from 'react'
import { Shapes } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const ContentToolsPage = lazy(() => import('./ContentToolsPage').then(m => ({ default: m.ContentToolsPage })))
const manifest: FeatureManifest = {
  id: 'content-tools',
  replacesMenus: ['markdown-card', 'image-mosaic', 'crypto', 'qrcode', 'formatter'],
  name: '内容工具',
  icon: Shapes,
  group: '内容',
  order: 30,
  description: 'Markdown 转卡片、图片打码、加解密、二维码与格式化',
  routes: [{ path: '/tools/content-tools', element: <ContentToolsPage /> }],
}
export default manifest
