import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { ChatItem } from '../types'
import type { VoiceEvent } from '../lib/nativeVoice'
import { upsertVoiceTranscript, type VoiceTranscriptItem } from '../lib/voiceTranscript'
import { useVoiceTransport } from './useVoiceTransport'

function fixture() {
  let items: ChatItem[] = [{ kind: 'user', id: 'typed', text: '原有文字' }]
  const send = vi.fn().mockReturnValue(true)
  const receive = (item: VoiceTranscriptItem) => { items = upsertVoiceTranscript(items, item) }
  const hook = renderHook(() => useVoiceTransport(send, vi.fn(), receive))
  const start = (callId = 'call-1') => act(() => {
    hook.result.current.transport.start({ callId, sdp: 'v=0' })
  })
  const emit = (event: Partial<VoiceEvent>) => act(() => {
    hook.result.current.handle({ type: 'voiceEvent', seq: 0, callId: 'call-1', event: 'transcript', ...event })
  })
  return { ...hook, start, emit, send, items: () => items }
}

it('puts spoken user and assistant utterances after the existing chat, correcting partial text in place', () => {
  const f = fixture()
  f.start()
  f.emit({ role: 'user', text: '我的' })
  f.emit({ role: 'user', text: '声音' })
  const id = f.items()[1].id
  f.emit({ role: 'assistant', text: '收到' })
  f.emit({ role: 'user', text: '我的话显示了吗？', done: true })
  f.emit({ role: 'assistant', text: '收到你的话了。', done: true })
  expect(f.items().map(item => 'text' in item ? item.text : '')).toEqual([
    '原有文字', '我的话显示了吗？', '收到你的话了。',
  ])
  expect(f.items()[1].id).toBe(id)
  expect(f.items().map(item => item.kind)).toEqual(['user', 'user', 'assistant'])
  f.emit({ role: 'user', text: '第二句', done: true })
  expect(f.items()).toHaveLength(4)
  expect(f.items()[3].id).not.toBe(id)
  f.unmount()
})

it('retains completed bubbles on hangup and rejects stale messages across calls', () => {
  const f = fixture()
  f.start()
  f.emit({ role: 'user', text: '保留我', done: true })
  act(() => f.result.current.transport.control('session-1', 'call-1', 'stop'))
  f.emit({ role: 'user', text: '迟到的消息', done: true })
  expect(f.items()).toHaveLength(2)
  f.start('call-2')
  f.emit({ role: 'assistant', text: '旧通话', done: true })
  f.emit({ callId: 'call-2', role: 'assistant', text: '新通话', done: true })
  expect(f.items()).toHaveLength(3)
  expect(f.items()[2]).toMatchObject({ kind: 'assistant', text: '新通话' })
  f.unmount()
})

it('ignores negotiation, unknown roles and empty transcripts without creating extra bubbles', () => {
  const f = fixture()
  f.start()
  f.emit({ event: 'sdp', sdp: 'private' })
  f.emit({ role: 'system', text: 'ignore', done: true })
  f.emit({ role: 'user', text: ' ', done: true })
  expect(f.items()).toHaveLength(1)
  f.emit({ role: 'user', text: '误识别' })
  f.emit({ role: 'user', text: '', done: true })
  expect(f.items()).toHaveLength(1)
  f.unmount()
})

it('drops late transcripts after an error and does not resend speech as a code request', () => {
  const f = fixture()
  f.start()
  f.emit({ role: 'user', text: '查一下', done: true })
  f.emit({ event: 'error', message: 'disconnected' })
  f.emit({ role: 'assistant', text: 'late', done: true })
  expect(f.items()).toHaveLength(2)
  expect(f.send).toHaveBeenCalledTimes(1)
  f.unmount()
})
