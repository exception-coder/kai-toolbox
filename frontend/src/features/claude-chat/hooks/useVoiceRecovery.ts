import { useEffect, useState } from 'react'
import type { VoiceTransport } from '../lib/nativeVoice'
import { hasVoiceRecoveryHint, rememberVoiceRecovery } from '../lib/voiceRecovery'
import { useNativeVoice } from './useNativeVoice'

interface Availability { connected: boolean; busy?: boolean; disabled?: boolean }

export function useVoiceRecovery(sessionId: string | null, transport: VoiceTransport,
  { connected, disabled }: Availability) {
  const voice = useNativeVoice(sessionId, transport, connected)
  const [intent, setIntent] = useState(() => ({ sessionId, recoverable: hasVoiceRecoveryHint(sessionId) }))
  const requestStart = () => {
    if (!sessionId || !connected || disabled || document.hidden
      || voice.state === 'connecting' || voice.state === 'connected') return
    void voice.start()
  }
  const stop = () => {
    if (sessionId) rememberVoiceRecovery(sessionId, false)
    setIntent({ sessionId, recoverable: false })
    voice.stop()
  }

  useEffect(() => {
    setIntent({ sessionId, recoverable: hasVoiceRecoveryHint(sessionId) })
  }, [sessionId])
  useEffect(() => {
    // 切换会话的首个 render 仍可能携带旧通话状态，不能给新会话写恢复提示。
    if (!sessionId || intent.sessionId !== sessionId || voice.state !== 'connected') return
    rememberVoiceRecovery(sessionId, true)
    setIntent({ sessionId, recoverable: true })
  }, [sessionId, intent.sessionId, voice.state])
  return { ...voice, start: requestStart, stop,
    recoverable: intent.sessionId === sessionId && intent.recoverable }
}
