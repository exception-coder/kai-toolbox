import { useEffect, useState } from 'react'
import type { VoiceTransport } from '../lib/nativeVoice'
import { hasExpiredVoiceRecoveryHint, hasVoiceRecoveryHint, rememberVoiceRecovery } from '../lib/voiceRecovery'
import { useNativeVoice } from './useNativeVoice'

interface Availability { connected: boolean; busy?: boolean; disabled?: boolean }

export function useVoiceRecovery(sessionId: string | null, transport: VoiceTransport,
  { connected, disabled, busy }: Availability) {
  const voice = useNativeVoice(sessionId, transport, connected)
  const restoredIntent = () => ({ sessionId, recoverable: hasVoiceRecoveryHint(sessionId), expired: hasExpiredVoiceRecoveryHint(sessionId) })
  const [intent, setIntent] = useState(restoredIntent)
  const recoveryUnavailable = intent.sessionId === sessionId && (intent.expired || voice.recoveryUnavailable)
  const requestStart = () => {
    if (!sessionId || !connected || disabled || document.hidden
      || (recoveryUnavailable && busy)
      || voice.state === 'connecting' || voice.state === 'connected') return
    if (recoveryUnavailable) {
      rememberVoiceRecovery(sessionId, false)
      setIntent({ sessionId, recoverable: false, expired: false })
    }
    void voice.start()
  }
  const stop = () => {
    if (sessionId) rememberVoiceRecovery(sessionId, false)
    setIntent({ sessionId, recoverable: false, expired: false })
    voice.stop()
  }

  useEffect(() => {
    setIntent({ sessionId, recoverable: hasVoiceRecoveryHint(sessionId), expired: hasExpiredVoiceRecoveryHint(sessionId) })
  }, [sessionId])
  useEffect(() => {
    // 切换会话的首个 render 仍可能携带旧通话状态，不能给新会话写恢复提示。
    if (!sessionId || intent.sessionId !== sessionId || voice.state !== 'connected') return
    rememberVoiceRecovery(sessionId, true)
    setIntent({ sessionId, recoverable: true, expired: false })
  }, [sessionId, intent.sessionId, voice.state])
  useEffect(() => {
    if (!sessionId || intent.sessionId !== sessionId || !voice.recoveryUnavailable) return
    rememberVoiceRecovery(sessionId, 'expired')
    setIntent({ sessionId, recoverable: false, expired: true })
  }, [sessionId, intent.sessionId, voice.recoveryUnavailable])
  return { ...voice, recoveryUnavailable, start: requestStart, stop,
    recoverable: intent.sessionId === sessionId && intent.recoverable }
}
