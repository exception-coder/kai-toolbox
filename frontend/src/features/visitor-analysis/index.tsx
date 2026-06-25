// 访客分析 feature manifest，遵循 featureRegistry 自动注册约定。
// 页面用 React.lazy 代码分割（CLAUDE.md 硬性要求），manifest 元数据保持 eager。
import { lazy } from 'react'
import { Navigate } from 'react-router-dom'
import { UserSearch } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

// 同一页面组件承载两个二级 Tab（访客分析 / 客户资料库），按子路由 pathname 切换面板。
const VisitorAnalysisPage = lazy(() =>
  import('./pages/VisitorAnalysisPage').then((m) => ({ default: m.VisitorAnalysisPage })),
)

const manifest: FeatureManifest = {
  id: 'visitor-analysis',
  name: '访客分析',
  icon: UserSearch,
  group: '智能体',
  description: '确定性匹配优先 + LangChain4j 灰区判别：识别访客是新客 / 熟客 / 竞品 / 供应商等',
  order: 30,
  // 侧边栏入口指向基路径：NavLink 对它按前缀匹配，两个子 Tab 下都保持高亮；
  // 基路径本身仅重定向到访客分析 Tab，用户不停留。两个 Tab 各自独立路由，便于直达/收藏。
  entry: '/tools/visitor-analysis',
  routes: [
    { path: '/tools/visitor-analysis', element: <Navigate to="/tools/visitor-analysis/analyze" replace /> },
    { path: '/tools/visitor-analysis/analyze', element: <VisitorAnalysisPage /> },
    { path: '/tools/visitor-analysis/customers', element: <VisitorAnalysisPage /> },
  ],
}

export default manifest
