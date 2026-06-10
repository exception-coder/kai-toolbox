import { lazy } from 'react'
import { Globe } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const VsCodeTunnelPage = lazy(() => import('./pages/VsCodeTunnelPage').then((m) => ({ default: m.VsCodeTunnelPage })))
const manifest: FeatureManifest = {
  id: 'vscode-tunnel',
  name: 'VS Code Tunnel',
  icon: Globe,
  group: '系统工具',
  description: '把本机 VS Code 暴露给手机浏览器（基于 code tunnel + GitHub OAuth）',
  order: 40,
  routes: [{ path: '/tools/vscode-tunnel', element: <VsCodeTunnelPage /> }],
}

export default manifest
