import { Globe } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { BrowserRequestPage } from './pages/BrowserRequestPage'

const manifest: FeatureManifest = {
  id: 'browser-request',
  name: '浏览器请求',
  icon: Globe,
  group: '网络工具',
  description: '打开站点登录后，用同一会话重放任意 HTTP 请求（含 curl 粘贴）',
  order: 55,
  routes: [{ path: '/tools/browser-request', element: <BrowserRequestPage /> }],
}

export default manifest
