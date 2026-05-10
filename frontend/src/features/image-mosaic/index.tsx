import { ImageOff } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { ImageMosaicPage } from './pages/ImageMosaicPage'

const manifest: FeatureManifest = {
  id: 'image-mosaic',
  name: '图片打码',
  icon: ImageOff,
  group: '内容工具',
  description: '上传图片后用矩形框选区域，一键像素化 / 高斯模糊 / 黑条遮挡，纯前端处理',
  order: 35,
  routes: [{ path: '/tools/image-mosaic', element: <ImageMosaicPage /> }],
}

export default manifest
