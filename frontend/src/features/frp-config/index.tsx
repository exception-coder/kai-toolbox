import { Share2 } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { FrpConfigPage } from './pages/FrpConfigPage'

const manifest: FeatureManifest = {
  id: 'frp-config',
  name: 'frp 可视化配置',
  icon: Share2,
  group: '运维工具',
  description: '通过 SSH 远程编辑 frps/frpc 的 TOML 配置，多端口/HTTP/UDP 一键生成，并附原理说明',
  order: 35,
  routes: [{ path: '/tools/frp-config', element: <FrpConfigPage /> }],
}

export default manifest
