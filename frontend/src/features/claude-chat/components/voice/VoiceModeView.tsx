import { useChatRuntime } from '../../runtime/ChatRuntimeContext'
import { useVoiceModeMachine } from '../../hooks/useVoiceModeMachine'
import { FishCanvas } from './FishCanvas'
import { TransientBubbleLayer } from './TransientBubbleLayer'
import { VoiceModeControls } from './VoiceModeControls'
import type { UseClaudeChatSocket } from '../../hooks/useClaudeChatSocket'

/**
 * 电子鱼语音模式全屏视图（挂在 App 层，跨路由）。
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
    <div className="fixed inset-0 z-[60] overflow-hidden bg-[radial-gradient(circle_at_50%_40%,#0b1220,#05070d)]">
      <FishCanvas drive={machine.drive} />
      <TransientBubbleLayer userText={machine.userText} aiText={machine.aiText} />
      <VoiceModeControls machine={machine} onExit={onExit} />
    </div>
  )
}
