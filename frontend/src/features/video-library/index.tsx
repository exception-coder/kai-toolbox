import { Film } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { VideoLibraryPage } from './pages/VideoLibraryPage'

const manifest: FeatureManifest = {
  id: 'video-library',
  name: '视频库',
  icon: Film,
  group: '媒体',
  description: '汇总已扫描磁盘里的所有视频，按名称或大小浏览，在线播放',
  order: 20,
  routes: [{ path: '/tools/video-library', element: <VideoLibraryPage /> }],
}

export default manifest
