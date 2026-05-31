import { FlaskConical } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { FfmpegLabPage } from './pages/FfmpegLabPage'

const manifest: FeatureManifest = {
  id: 'ffmpeg-lab',
  name: 'FFmpeg 转码实验台',
  icon: FlaskConical,
  group: '媒体',
  description: '输入本地视频路径，逐个试验多种转码/封装输出模式，判断哪种能把该格式正常输出到 web 播放',
  order: 21,
  routes: [{ path: '/tools/ffmpeg-lab', element: <FfmpegLabPage /> }],
}

export default manifest
