import { Share2 } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { LanSharePage } from './pages/LanSharePage'

const manifest: FeatureManifest = {
  id: 'lan-share',
  name: '局域网文件传输',
  icon: Share2,
  group: '网络工具',
  description: '输入相同房间号，组内设备 P2P 互传文件，单发或群发',
  order: 20,
  routes: [{ path: '/tools/lan-share', element: <LanSharePage /> }],
}

export default manifest
