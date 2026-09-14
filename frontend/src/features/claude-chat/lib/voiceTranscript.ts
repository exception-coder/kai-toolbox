import type { ChatItem } from '../types'
import type { VoiceEvent } from './nativeVoice'

export type VoiceTranscriptItem = Extract<ChatItem, { kind: 'user' | 'assistant' }>
const VOICE_MESSAGE_PREFIX = 'voice-transcript:'

export function isVoiceTranscriptItem(item: ChatItem): boolean {
  return item.id.startsWith(VOICE_MESSAGE_PREFIX)
}

/** Keeps each spoken utterance stable while its final transcription corrects partial text. */
export class VoiceTranscriptAssembler {
  private pending: Partial<Record<'user' | 'assistant', VoiceTranscriptItem>> = {}
  private sequence = 0

  constructor(private readonly callId: string) {}

  accept(event: VoiceEvent): VoiceTranscriptItem | null {
    if (event.callId !== this.callId || event.event !== 'transcript'
      || (event.role !== 'user' && event.role !== 'assistant')) return null
    const role = event.role
    const previous = this.pending[role]
    const text = event.done ? event.text ?? previous?.text ?? '' : (previous?.text ?? '') + (event.text ?? '')
    if (!previous && !text.trim()) return null
    const item: VoiceTranscriptItem = {
      kind: role, id: previous?.id ?? `${VOICE_MESSAGE_PREFIX}${this.callId}:${++this.sequence}`,
      text, ts: previous?.ts ?? Date.now(),
    }
    if (event.done) delete this.pending[role]
    else this.pending[role] = item
    return item
  }
}

export function upsertVoiceTranscript(items: ChatItem[], transcript: VoiceTranscriptItem): ChatItem[] {
  const index = items.findIndex(item => item.id === transcript.id)
  if (index < 0) return transcript.text.trim() ? [...items, transcript] : items
  if (!transcript.text.trim()) return items.filter(item => item.id !== transcript.id)
  return items.map((item, position) => position === index ? transcript : item)
}
