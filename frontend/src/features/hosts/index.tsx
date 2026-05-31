import { Server } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { HostsPage } from './pages/HostsPage'

const manifest: FeatureManifest = {
  id: 'hosts',
  name: '主机管理',
  icon: Server,
  group: '运维工具',
  description: '统一登记 SSH 主机，供磁盘扫描、frp 配置等工具复用',
  order: 30,
  routes: [{ path: '/tools/hosts', element: <HostsPage /> }],
}

export default manifest
