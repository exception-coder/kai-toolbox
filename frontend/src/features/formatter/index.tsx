import { lazy } from 'react'
import { Braces } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const FormatterPage = lazy(() => import('./pages/FormatterPage').then((m) => ({ default: m.FormatterPage })))
const manifest: FeatureManifest = {
  id: 'formatter',
  name: '格式化工具',
  icon: Braces,
  group: '内容工具',
  description: 'JSON / Nginx 格式化与压缩，纯前端解析',
  order: 50,
  routes: [{ path: '/tools/formatter', element: <FormatterPage /> }],
}

export default manifest
