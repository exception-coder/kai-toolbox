import { LegacyLocalToolRedirect } from '@/features/local-tools/public-api'
import { TerminalSquare } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const manifest: FeatureManifest = {
  id: 'webterm',
  chrome: true,
  name: 'Web 终端',
  icon: TerminalSquare,
  group: '系统',
  description: '在浏览器中打开 PowerShell / cmd 命令行',
  order: 30,
  routes: [{ path: '/tools/webterm', element: <LegacyLocalToolRedirect tool="webterm" /> }],
}

export default manifest
