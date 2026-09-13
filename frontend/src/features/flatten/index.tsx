import { LegacyLocalToolRedirect } from '@/features/local-tools/public-api'
import { FolderInput } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const manifest: FeatureManifest = {
  id: 'flatten',
  chrome: true,
  name: '目录扁平化',
  icon: FolderInput,
  group: '系统',
  description: '把嵌套目录中的文件平铺到一处；迁移前先检测重复并选择性删除',
  order: 20,
  routes: [{ path: '/tools/flatten', element: <LegacyLocalToolRedirect tool="flatten" /> }],
}

export default manifest
