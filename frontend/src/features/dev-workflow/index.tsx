import { lazy } from 'react'
import { Workflow } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const DevWorkflowPage = lazy(() =>
  import('./pages/DevWorkflowPage').then((m) => ({ default: m.DevWorkflowPage }))
)

/**
 * 研发全流程演示 Showcase 页。
 * layout: 'showcase' → 全屏无侧边栏，公开免登录，适合投屏给领导演示。
 * 路由：/showcase/dev-workflow
 */
const manifest: FeatureManifest = {
  id: 'dev-workflow',
  name: '研发链路演示',
  icon: Workflow,
  group: '展示',
  description: '演示 AI 驱动的完整研发链路：需求澄清 → PRD 生成 → 工作台开发 → 实时预览',
  order: 1,
  layout: 'showcase',
  routes: [{ path: '/showcase/dev-workflow', element: <DevWorkflowPage /> }],
}

export default manifest
