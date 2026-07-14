import { lazy } from 'react'
import { Sparkles } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const ShowcaseDemoPage = lazy(() => import('./pages/ShowcaseDemoPage').then((m) => ({ default: m.ShowcaseDemoPage })))
const ErpOverviewPage = lazy(() => import('./pages/ErpOverviewPage').then((m) => ({ default: m.ErpOverviewPage })))

// layout: 'showcase' → 路由脱离 AppShell，全屏渲染、公开免鉴权（见 App.tsx 分流）。
// hidden: true → 暂从注册表整体剔除（不出现在菜单/首页/菜单配置，路由也不注册）。
// 「只能通过源码开启」：把下面 hidden 改为 false（或删除该行）即恢复。
const manifest: FeatureManifest = {
  id: 'showcase',
  name: '睿程 ERP 全景图',
  icon: Sparkles,
  group: '展示',
  description: '全屏展示型布局（产品官网/信息图风，非后台风）',
  order: 5,
  hidden: true,
  layout: 'showcase',
  entry: '/showcase/erp',
  routes: [
    { path: '/showcase/erp', element: <ErpOverviewPage /> },
    { path: '/showcase/demo', element: <ShowcaseDemoPage /> },
  ],
}

export default manifest
