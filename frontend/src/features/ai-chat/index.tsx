import { lazy } from 'react'
import { MessagesSquare } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const ChatPage = lazy(() => import('./pages/ChatPage').then((m) => ({ default: m.ChatPage })))

const manifest: FeatureManifest = {
  id: 'ai-chat',
  name: 'AI 对话',
  icon: MessagesSquare,
  group: 'AI 工具',
  description: '经 4sapi 直连多模型的 API 流式聊天：会话历史、切模型、系统提示词、图片输入',
  order: 51,
  routes: [{ path: '/tools/ai-chat', element: <ChatPage /> }],
}

export default manifest
