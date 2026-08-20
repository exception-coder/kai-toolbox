import type { AssistantDebugEntry } from './types'

export const MAX_ASSISTANT_DEBUG_ENTRIES = 200

export function createAssistantDebugEntry(
  category: AssistantDebugEntry['category'],
  summary: string,
  detail?: AssistantDebugEntry['detail'],
): AssistantDebugEntry {
  return { id: createId(), timestamp: Date.now(), category, summary, detail }
}

function createId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `debug-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
