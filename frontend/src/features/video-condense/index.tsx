import { Gauge } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { VideoCondensePage } from './pages/VideoCondensePage'

const manifest: FeatureManifest = {
  id: 'video-condense',
  name: '视频智能变速',
  icon: Gauge,
  group: '媒体',
  description: '分析录屏画面活动度，生成动态速度曲线，无聊段加速、关键段保速，输出浓缩视频',
  order: 22,
  routes: [{ path: '/tools/video-condense', element: <VideoCondensePage /> }],
}

export default manifest
