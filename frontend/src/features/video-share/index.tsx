import { lazy } from 'react'
import { Share2 } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const SharedVideoPage = lazy(() =>
  import('./pages/SharedVideoPage').then(m => ({ default: m.SharedVideoPage })),
)

/**
 * 视频分享落地页。
 *
 * - {@code layout: 'showcase'} —— App.tsx 把 showcase 路由单独成树、不套 RouteGuard，
 *   这是仓库里既有的「公开免登录页」机制（welfare-sign-demo 同款），不是新开的后门。
 * - {@code chrome: true} —— 不进侧边栏与首页：这是给收链接的人看的页面，
 *   对工作台使用者本身没有入口价值。
 * - 路由用 {@code /s/:token} 而不是惯例的 {@code /showcase/<id>}：这个地址是要贴进
 *   微信聊天窗的，越短越好，也更少暴露内部模块名。
 */
const manifest: FeatureManifest = {
  id: 'video-share',
  name: '视频分享',
  icon: Share2,
  description: '通过分享链接匿名观看单个视频',
  layout: 'showcase',
  hideDock: true,
  chrome: true,
  routes: [{ path: '/s/:token', element: <SharedVideoPage /> }],
}

export default manifest
