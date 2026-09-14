import { useMemo, useRef } from 'react'
import type { ClientMessage, ServerMessage } from '../types'
import type { VoiceEvent, VoiceTransport } from '../lib/nativeVoice'
import { VoiceTranscriptAssembler, type VoiceTranscriptItem } from '../lib/voiceTranscript'

/** Ephemeral negotiation bypasses transcript replay, debug capture and reconnect queues. */
export function useVoiceTransport(send: (message: ClientMessage) => boolean, onStart: () => void,
  onTranscript: (item: VoiceTranscriptItem) => void) {
  const onStartRef = useRef(onStart)
  onStartRef.current = onStart
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript
  return useMemo(() => {
    const listeners = new Set<(event: VoiceEvent) => void>()
    let activeCallId: string | null = null
    let transcript: VoiceTranscriptAssembler | null = null
    const transport: VoiceTransport = {
      start: voice => {
        if (!send({ type: 'send', text: '开始语音会话', messageId: voice.callId, voice })) return false
        activeCallId = voice.callId
        transcript = new VoiceTranscriptAssembler(voice.callId)
        onStartRef.current()
        return true
      },
      control: (sessionId, callId, action) => {
        if (action === 'stop' && callId === activeCallId) {
          activeCallId = null
          transcript = null
        }
        send({ type: 'voiceControl', sessionId, callId, action })
      },
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
        const item = event.callId === activeCallId ? transcript?.accept(event) : null
        if (item) onTranscriptRef.current(item)
        listeners.forEach(listener => listener(event!))
        if (event.callId === activeCallId && ['closed', 'error'].includes(event.event)) {
          activeCallId = null
          transcript = null
        }
      }
      return message.type === 'voiceEvent'
    }
    return { transport, handle }
  }, [send])
}
