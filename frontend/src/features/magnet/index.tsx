import { Magnet } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { MagnetPage } from './pages/MagnetPage'

const manifest: FeatureManifest = {
  id: 'magnet',
  name: '磁力 / BT 下载',
  icon: Magnet,
  group: '网络工具',
  description: '本地 aria2 下载，提交前并发查公共种子缓存跳过 DHT 解析',
  order: 26,
  routes: [{ path: '/tools/magnet', element: <MagnetPage /> }],
}

export default manifest
