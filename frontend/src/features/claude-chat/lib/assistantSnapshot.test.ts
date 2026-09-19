import { describe, expect, it } from 'vitest'
import type { ChatItem } from '../types'
import { applyAssistantSnapshot } from './assistantSnapshot'

describe('applyAssistantSnapshot', () => {
  it('replaces the latest assistant draft without changing surrounding items', () => {
    const items: ChatItem[] = [
      { kind: 'user', id: 'u1', text: '你是什么模式' },
      { kind: 'assistant', id: 'a1', text: '避免跨项目污���' },
      { kind: 'tool', id: 't1', toolName: 'read', input: {} },
    ]

    const result = applyAssistantSnapshot(items, '避免跨项目污染')

    expect(result[1]).toEqual({ kind: 'assistant', id: 'a1', text: '避免跨项目污染' })
    expect(result[0]).toBe(items[0])
    expect(result[2]).toBe(items[2])
  })

  it('does not replace a voice transcript or a completed previous turn', () => {
    const voice: ChatItem[] = [{ kind: 'assistant', id: 'voice-transcript:call:1', text: '语音' }]
    expect(applyAssistantSnapshot(voice, '校准', 10)).toEqual([
      voice[0],
      { kind: 'assistant', id: 'assistant-snapshot:10', text: '校准', ts: 10 },
    ])

    const completed: ChatItem[] = [
      { kind: 'assistant', id: 'a1', text: '上一轮' },
      { kind: 'result', id: 'r1', stopReason: 'end_turn' },
    ]
    expect(applyAssistantSnapshot(completed, '校准', 20)).toEqual([
      ...completed,
      { kind: 'assistant', id: 'assistant-snapshot:20', text: '校准', ts: 20 },
    ])
  })
})
