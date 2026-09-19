import type { ChatItem } from '../types'
import { isVoiceTranscriptItem } from './voiceTranscript'

/** Applies a terminal full-text snapshot only to the current non-voice assistant draft. */
export function applyAssistantSnapshot(items: ChatItem[], text: string, now = Date.now()): ChatItem[] {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]
    if (item.kind === 'result' || item.kind === 'error') break
    if (item.kind !== 'assistant' || isVoiceTranscriptItem(item)) continue
    const copy = items.slice()
    copy[index] = { ...item, text }
    return copy
  }
  return text ? [...items, { kind: 'assistant', id: `assistant-snapshot:${now}`, text, ts: now }] : items
}
