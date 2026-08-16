import { lazy } from 'react'
import { ReceiptText } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const ToolboxSupplierQuoteEntry = lazy(() =>
  import('./toolbox-entry').then(module => ({ default: module.ToolboxSupplierQuoteEntry })),
)

const manifest: FeatureManifest = {
  id: 'supplier-quote-h5',
  name: '供应商报价 H5',
  icon: ReceiptText,
  group: '演示',
  description: '专属邀请自动注册、微信身份绑定与移动端供应商报价的独立发布样板',
  order: 91,
  layout: 'showcase',
  hideDock: true,
  entry: '/showcase/supplier-quote/q/demo-quote',
  routes: [{ path: '/showcase/supplier-quote/*', element: <ToolboxSupplierQuoteEntry /> }],
}

export default manifest
