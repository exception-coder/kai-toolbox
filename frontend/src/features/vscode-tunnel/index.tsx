import { LegacyLocalToolRedirect } from '@/features/local-tools/public-api'
import { Globe } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const manifest: FeatureManifest = {
  id: 'vscode-tunnel',
  chrome: true,
  name: 'VS Code Tunnel',
  icon: Globe,
  group: '系统',
  description: '把本机 VS Code 暴露给手机浏览器（基于 code tunnel + GitHub OAuth）',
  order: 40,
  routes: [{ path: '/tools/vscode-tunnel', element: <LegacyLocalToolRedirect tool="vscode-tunnel" /> }],
}

export default manifest
