import { lazy } from 'react'
import { Film } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const MediaParserPage = lazy(() => import('./pages/MediaParserPage').then((m) => ({ default: m.MediaParserPage })))
const manifest: FeatureManifest = {
  id: 'media-parser',
  name: '媒体解析',
  icon: Film,
  group: '网络工具',
  description: '解析 TikTok、抖音、Instagram、YouTube 等平台分享链接，提取无水印视频与图片',
  order: 50,
  routes: [{ path: '/tools/media-parser', element: <MediaParserPage /> }],
}

export default manifest
