import { describe, expect, it } from 'vitest'
import { appendAssistantDelta, applyToolResult, upsertToolUse } from './chatItemReducers'
import type { ChatItem } from '../types'

const ids = () => { let n = 0; return () => `id-${++n}` }

describe('chatItemReducers', () => {
  it('appends streaming text to the last assistant reply or starts a new one', () => {
    const first = appendAssistantDelta([], 'Hel', ids(), 1)
    expect(first).toEqual([{ kind: 'assistant', id: 'id-1', text: 'Hel', ts: 1 }])
    expect(appendAssistantDelta(first, 'lo', ids(), 2)).toEqual([{ kind: 'assistant', id: 'id-1', text: 'Hello', ts: 1 }])
    const afterUser: ChatItem[] = [...first, { kind: 'user', id: 'u', text: 'q', ts: 3 } as ChatItem]
    expect(appendAssistantDelta(afterUser, 'next', ids(), 4).at(-1)).toMatchObject({ kind: 'assistant', text: 'next' })
  })

  it('upserts tool calls by stable id and appends legacy calls', () => {
    const started = upsertToolUse([], { toolCallId: 'c1', toolName: 'Bash', input: { cmd: 'ls' } }, ids(), 10)
    expect(started).toEqual([{ kind: 'tool', id: 'tool-c1', toolCallId: 'c1', toolName: 'Bash', input: { cmd: 'ls' }, ts: 10 }])
    const updated = upsertToolUse(started, { toolCallId: 'c1', toolName: 'Bash', input: { cmd: 'pwd' } }, ids(), 11)
    expect(updated).toHaveLength(1)
    expect(updated[0]).toMatchObject({ input: { cmd: 'pwd' }, ts: 11 })
    expect(upsertToolUse(updated, { toolCallId: null, toolName: 'Read', input: {} }, ids(), 12)).toHaveLength(2)
  })

  it('fills tool results by id, falls back to name, and appends orphan results', () => {
    const items = upsertToolUse([], { toolCallId: 'c1', toolName: 'Bash', input: null }, ids(), 100)
    const byId = applyToolResult(items, { toolCallId: 'c1', toolName: 'Bash', output: 'ok' }, ids(), 160)
    expect(byId[0]).toMatchObject({ output: 'ok', elapsedMs: 60 })
    const legacy = upsertToolUse([], { toolName: 'Read', input: null }, ids(), 5)
    expect(applyToolResult(legacy, { toolName: 'Read', output: 'text' }, ids(), 9)[0]).toMatchObject({ output: 'text', elapsedMs: 4 })
    const orphan = applyToolResult([], { toolCallId: 'x', toolName: 'Grep', output: 'none', isError: true }, ids(), 1)
    expect(orphan).toEqual([{ kind: 'tool', id: 'tool-x', toolCallId: 'x', toolName: 'Grep', input: null, output: 'none', isError: true, ts: 1 }])
  })
})
