import { lazy } from 'react'
import { Wrench } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const LocalToolsPage = lazy(() => import('./LocalToolsPage').then(m => ({ default: m.LocalToolsPage })))
const manifest: FeatureManifest = {
  id: 'local-tools',
  replacesMenus: ['flatten', 'port-process', 'webterm', 'vscode-tunnel'],
  name: '本机工具',
  icon: Wrench,
  group: '系统',
  order: 20,
  description: '目录扁平化、端口进程查询、Web 终端与 VS Code Tunnel',
  routes: [{ path: '/tools/local-tools', element: <LocalToolsPage /> }],
}
export default manifest
