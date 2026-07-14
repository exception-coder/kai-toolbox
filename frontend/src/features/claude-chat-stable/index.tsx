import { lazy } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { ChatRuntimeProvider } from './runtime/ChatRuntimeContext'
import { FloatingChatWindow } from './components/FloatingChatWindow'
import { VoiceModeView } from './components/voice/VoiceModeView'

const ChatPage = lazy(() => import('./pages/ChatPage').then((m) => ({ default: m.ChatPage })))

function StableChatExperience() {
  return (
    <ChatRuntimeProvider>
      <ChatPage />
      <FloatingChatWindow />
      <VoiceModeView />
    </ChatRuntimeProvider>
  )
}

const manifest: FeatureManifest = {
  id: 'claude-chat-stable',
  name: 'Vibe Coding（稳定版）',
  icon: ShieldCheck,
  group: 'AI',
  description: '当前 Vibe Coding 的稳定快照；后续开发版改动不会自动影响此入口。',
  order: 51,
  routes: [{ path: '/tools/claude-chat-stable', element: <StableChatExperience /> }],
}

export default manifest
