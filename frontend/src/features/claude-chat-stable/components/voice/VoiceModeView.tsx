import { useChatRuntime } from '../../runtime/ChatRuntimeContext'
import { useVoiceModeMachine } from '../../hooks/useVoiceModeMachine'
import { CloudCanvas } from './CloudCanvas'
import { TransientBubbleLayer } from './TransientBubbleLayer'
import { VoiceModeControls } from './VoiceModeControls'
import type { UseClaudeChatSocket } from '../../hooks/useClaudeChatSocket'

/**
 * 云团语音模式全屏视图（挂在 App 层，跨路由）。
 * voiceMode 为 false 时不挂载内层（避免常驻持有录音/分析 hook）。
 */
export function VoiceModeView() {
  const { voiceMode, chat, setVoiceMode } = useChatRuntime()
  if (!voiceMode || !chat) return null
  return <VoiceModeInner chat={chat} onExit={() => setVoiceMode(false)} />
}

function VoiceModeInner({ chat, onExit }: { chat: UseClaudeChatSocket; onExit: () => void }) {
  const machine = useVoiceModeMachine(chat)
  return (
    <div className="fixed inset-0 z-[60] overflow-hidden bg-[#8ec7f5]">
      <CloudCanvas drive={machine.drive} />
      <TransientBubbleLayer userText={machine.userText} aiText={machine.aiText} />
      <VoiceModeControls machine={machine} onExit={onExit} />
    </div>
  )
}
