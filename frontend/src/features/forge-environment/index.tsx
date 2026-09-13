import { Navigate, useLocation } from 'react-router-dom'
import { Blocks } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

export function LegacyEnvironmentRedirect() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  params.set('section', 'environment')
  return <Navigate to={`/tools/project-workspace?${params}${location.hash}`} replace />
}

const manifest: FeatureManifest = {
  id: 'forge-environment',
  name: 'Forge 环境',
  icon: Blocks,
  group: '系统',
  description: '研发环境检测与一键初始化',
  order: 7,
  requiredPermission: 'forge:environment:menu',
  chrome: true,
  routes: [{ path: '/tools/forge-environment', element: <LegacyEnvironmentRedirect /> }],
}

export default manifest
