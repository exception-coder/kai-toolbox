import { LegacyContentRedirect } from '@/features/content-tools/public-api'
import { ImageOff } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const manifest: FeatureManifest = {
  id: 'image-mosaic',
  chrome: true,
  name: '图片打码',
  icon: ImageOff,
  group: '内容',
  description: '上传图片后用矩形框选区域，一键像素化 / 高斯模糊 / 黑条遮挡，纯前端处理',
  order: 35,
  routes: [{ path: '/tools/image-mosaic', element: <LegacyContentRedirect tool="image-mosaic" /> }],
}

export default manifest
