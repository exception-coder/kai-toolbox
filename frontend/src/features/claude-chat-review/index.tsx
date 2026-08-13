import { lazy } from 'react'
import { MessagesSquare } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const ReviewPage = lazy(() => import('./pages/ReviewPage').then(module => ({ default: module.ReviewPage })))

const manifest: FeatureManifest = {
  id: 'claude-chat-review',
  name: '开发计划评审',
  icon: MessagesSquare,
  layout: 'showcase',
  hideDock: true,
  chrome: true,
  routes: [{ path: '/review/:token', element: <ReviewPage /> }],
}

export default manifest
