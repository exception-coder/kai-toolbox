import { lazy } from 'react'
import { FolderInput } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const FlattenPage = lazy(() => import('./pages/FlattenPage').then((m) => ({ default: m.FlattenPage })))
const manifest: FeatureManifest = {
  id: 'flatten',
  name: '目录扁平化',
  icon: FolderInput,
  group: '系统工具',
  description: '把嵌套目录中的文件平铺到一处；迁移前先检测重复并选择性删除',
  order: 20,
  routes: [{ path: '/tools/flatten', element: <FlattenPage /> }],
}

export default manifest
