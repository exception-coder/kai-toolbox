import { Globe } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { BrowserRequestPage } from './pages/BrowserRequestPage'

const manifest: FeatureManifest = {
  id: 'browser-request',
  name: '站点录制编排',
  icon: Globe,
  group: '网络工具',
  description: '浏览器里点一遍 → 自动录 HTTP 调用 → 标参数 → 一键回放',
  order: 55,
  routes: [{ path: '/tools/browser-request', element: <BrowserRequestPage /> }],
}

export default manifest
