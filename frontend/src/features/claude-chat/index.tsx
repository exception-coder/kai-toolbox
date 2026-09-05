import { BotMessageSquare } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { ChatPage } from './pages/ChatPage'
import { SessionClientPage } from './pages/SessionClientPage'

const manifest: FeatureManifest = {
  id: 'claude-chat',
  name: 'Vibe Coding',
  icon: BotMessageSquare,
  group: 'AI',
  description: '移动端聊天式驱动 Claude：流式回复、可视化批准、随时切会话、完成通知',
  order: 50,
  entry: '/tools/claude-chat',
  routes: [
    { path: '/tools/claude-chat', element: <ChatPage /> },
    { path: '/session-client', element: <SessionClientPage /> },
  ],
}

export default manifest
