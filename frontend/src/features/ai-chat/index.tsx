import { Navigate } from 'react-router-dom'
import { MessagesSquare } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const manifest: FeatureManifest = {
  id: 'ai-chat',
  name: 'AI 对话',
  icon: MessagesSquare,
  group: 'AI',
  description: '经 4sapi 直连多模型的 API 流式聊天：会话历史、切模型、系统提示词、图片输入',
  order: 51,
  chrome: true,
  routes: [{ path: '/tools/ai-chat', element: <Navigate replace to="/tools/claude-chat?control=llm" /> }],
}

export default manifest
