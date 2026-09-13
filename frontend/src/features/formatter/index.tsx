import { LegacyContentRedirect } from '@/features/content-tools/public-api'
import { Braces } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const manifest: FeatureManifest = {
  id: 'formatter',
  chrome: true,
  name: '格式化工具',
  icon: Braces,
  group: '内容',
  description: 'JSON / Nginx 格式化与压缩，纯前端解析',
  order: 50,
  routes: [{ path: '/tools/formatter', element: <LegacyContentRedirect tool="formatter" /> }],
}

export default manifest
