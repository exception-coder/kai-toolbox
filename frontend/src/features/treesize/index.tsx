import { lazy } from 'react'
import { HardDrive } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const TreeSizePage = lazy(() => import('./pages/TreeSizePage').then((m) => ({ default: m.TreeSizePage })))
const manifest: FeatureManifest = {
  id: 'treesize',
  name: '磁盘空间分析',
  icon: HardDrive,
  group: '系统工具',
  description: '扫描目录、按大小可视化、找出占用最多空间的文件夹',
  order: 10,
  routes: [{ path: '/tools/treesize', element: <TreeSizePage /> }],
}

export default manifest
