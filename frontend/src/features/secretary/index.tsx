import { lazy } from 'react'
import { NotebookPen } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const SecretaryPage = lazy(() => import('./pages/SecretaryPage').then((m) => ({ default: m.SecretaryPage })))
const manifest: FeatureManifest = {
  id: 'secretary',
  name: '个人秘书',
  icon: NotebookPen,
  group: '内容工具',
  description: '文字 / 语音 / 附件随手记，自动带时间戳、输入方式与可选地点；纯本地 IndexedDB',
  order: 35,
  routes: [{ path: '/tools/secretary', element: <SecretaryPage /> }],
}

export default manifest
