import { BotMessageSquare } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { ChatControlWorkspace } from './pages/ChatControlWorkspace'

const manifest: FeatureManifest = {
  id: 'claude-chat',
  name: 'Vibe Coding',
  icon: BotMessageSquare,
  group: 'AI',
  description: '移动端聊天式驱动 Claude：流式回复、可视化批准、随时切会话、完成通知',
  order: 50,
  entry: '/tools/claude-chat',
  controlPermissions: { parameter: 'control', modes: { llm: 'menu:ai-chat' } },
  routes: [
    { path: '/tools/claude-chat', element: <ChatControlWorkspace /> },
  ],
}

export default manifest
