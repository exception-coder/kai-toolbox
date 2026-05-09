import { TerminalSquare } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { WebTermPage } from './pages/WebTermPage'

const manifest: FeatureManifest = {
  id: 'webterm',
  name: 'Web 终端',
  icon: TerminalSquare,
  group: '系统工具',
  description: '在浏览器中打开 PowerShell / cmd 命令行',
  order: 30,
  routes: [{ path: '/tools/webterm', element: <WebTermPage /> }],
}

export default manifest
