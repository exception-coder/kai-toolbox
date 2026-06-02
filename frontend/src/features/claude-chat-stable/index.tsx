import { ShieldCheck } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { ChatPage } from './pages/ChatPage'

const manifest: FeatureManifest = {
  id: 'claude-chat-stable',
  name: 'Claude 助手（稳定版）',
  icon: ShieldCheck,
  group: 'AI 工具',
  description: '稳定版前端：与开发版共用同一后端接口，前端代码冻结，开发改动不影响此入口',
  order: 51,
  routes: [{ path: '/tools/claude-chat-stable', element: <ChatPage /> }],
}

export default manifest
