import { lazy } from 'react'
import { BotMessageSquare } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const ChatPage = lazy(() => import('./pages/ChatPage').then((m) => ({ default: m.ChatPage })))
const manifest: FeatureManifest = {
  id: 'claude-chat',
  name: 'Vibe Coding',
  icon: BotMessageSquare,
  group: 'AI',
  description: '移动端聊天式驱动 Claude：流式回复、可视化批准、随时切会话、完成通知',
  order: 50,
  routes: [{ path: '/tools/claude-chat', element: <ChatPage /> }],
}

export default manifest
