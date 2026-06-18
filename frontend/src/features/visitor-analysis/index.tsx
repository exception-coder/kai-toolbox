// 访客分析 feature manifest，遵循 featureRegistry 自动注册约定。
// 页面用 React.lazy 代码分割（CLAUDE.md 硬性要求），manifest 元数据保持 eager。
import { lazy } from 'react'
import { UserSearch } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const VisitorAnalysisPage = lazy(() =>
  import('./pages/VisitorAnalysisPage').then((m) => ({ default: m.VisitorAnalysisPage })),
)

const manifest: FeatureManifest = {
  id: 'visitor-analysis',
  name: '访客分析',
  icon: UserSearch,
  group: '智能体',
  description: '确定性匹配优先 + AgentScope 灰区判别：识别访客是新客 / 熟客 / 竞品 / 供应商等',
  order: 30,
  routes: [{ path: '/tools/visitor-analysis', element: <VisitorAnalysisPage /> }],
}

export default manifest
