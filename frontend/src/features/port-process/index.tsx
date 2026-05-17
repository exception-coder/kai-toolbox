import { Network } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { PortProcessPage } from './pages/PortProcessPage'

const manifest: FeatureManifest = {
  id: 'port-process',
  name: '端口进程查询',
  icon: Network,
  group: '系统工具',
  description: '按端口反查占用进程，自动适配 Windows / Linux / macOS，覆盖 IPv4 与 IPv6',
  order: 25,
  routes: [{ path: '/tools/port-process', element: <PortProcessPage /> }],
}

export default manifest
