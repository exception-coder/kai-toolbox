import { LegacyOpsRedirect } from './public-api'
import { DatabaseZap } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const manifest: FeatureManifest = {
  id: 'ops',
  name: '系统资源与测试账号',
  icon: DatabaseZap,
  group: '系统',
  description: '在 AI 交付中心管理系统资源关系，供 Tool 与 MCP 发现和测试',
  chrome: true,
  order: 6,
  routes: [{ path: '/tools/ops', element: <LegacyOpsRedirect /> }],
}

export default manifest
