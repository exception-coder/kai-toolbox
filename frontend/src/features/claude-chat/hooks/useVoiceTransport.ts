import { useMemo, useRef } from 'react'
import type { ClientMessage, ServerMessage } from '../types'
import type { VoiceEvent, VoiceTransport } from '../lib/nativeVoice'

/** Ephemeral negotiation bypasses transcript replay, debug capture and reconnect queues. */
export function useVoiceTransport(send: (message: ClientMessage) => boolean, onStart: () => void) {
  const onStartRef = useRef(onStart)
  onStartRef.current = onStart
  return useMemo(() => {
    const listeners = new Set<(event: VoiceEvent) => void>()
    let activeCallId: string | null = null
    const transport: VoiceTransport = {
      start: voice => {
        if (!send({ type: 'send', text: '开始语音会话', messageId: voice.callId, voice })) return false
        activeCallId = voice.callId
        onStartRef.current()
        return true
      },
      control: (sessionId, callId, action) => { send({ type: 'voiceControl', sessionId, callId, action }) },
      subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    }
    const handle = (message: ServerMessage): boolean => {
      let event: VoiceEvent | null = message.type === 'voiceEvent' ? message : null
      if (activeCallId && (message.type === 'error' || message.type === 'result')) {
        event = { type: 'voiceEvent', seq: 0, callId: activeCallId,
          event: message.type === 'error' ? 'error' : 'closed',
          message: message.type === 'error' ? message.message : undefined }
      }
      if (event) {
        listeners.forEach(listener => listener(event!))
        if (event.callId === activeCallId && ['closed', 'error'].includes(event.event)) activeCallId = null
      }
      return message.type === 'voiceEvent'
    }
    return { transport, handle }
  }, [send])
}
