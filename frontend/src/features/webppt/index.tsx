import { lazy } from 'react'
import { Presentation } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const WebPptHome = lazy(() => import('./pages/WebPptHome').then((m) => ({ default: m.WebPptHome })))

const manifest: FeatureManifest = {
  id: 'webppt',
  name: 'WebPPT 风格中心',
  icon: Presentation,
  group: '内容创作',
  description: '统一、可版本追溯的 WebPPT 风格规范：Design Token、生成提示词与 reveal.js 落地样例',
  order: 70,
  entry: '/tools/webppt',
  routes: [{ path: '/tools/webppt', element: <WebPptHome /> }],
}

export default manifest
