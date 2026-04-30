import type { FeatureManifest } from '@/shell/types'
import { TreeSizePage } from './pages/TreeSizePage'

const manifest: FeatureManifest = {
  id: 'treesize',
  routes: [{ path: '/tools/treesize', element: <TreeSizePage /> }],
}

export default manifest
