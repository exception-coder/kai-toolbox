import { Bot } from 'lucide-react'
import { preloadable } from '@/lib/preloadable'
import type { FeatureManifest } from '@/shell/types'

const Home = preloadable(() => import('./pages/AssistantHome').then(module => ({ default: module.AssistantHome })))
const manifest: FeatureManifest = {
  id: 'work-assistants', name: '工作助理', icon: Bot, group: 'AI', order: 52,
  description: '唤醒专属工作机器人，整理周报与登记环境资源',
  routes: [{ path: '/tools/work-assistants', element: <Home /> }],
}
export default manifest
