import { Download } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { DownloaderPage } from './pages/DownloaderPage'

const manifest: FeatureManifest = {
  id: 'downloader',
  name: '智能加速下载器',
  icon: Download,
  group: '网络工具',
  description: '粘贴 URL 直接下载，自动选直连/代理中更快的链路，分段并发 + 断点续传',
  order: 25,
  routes: [{ path: '/tools/downloader', element: <DownloaderPage /> }],
}

export default manifest
