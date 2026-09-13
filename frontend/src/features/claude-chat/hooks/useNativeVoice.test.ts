import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { VoiceEvent, VoiceTransport } from '../lib/nativeVoice'
import { useNativeVoice } from './useNativeVoice'

const media = vi.hoisted(() => ({ instances: [] as Array<{
  close: ReturnType<typeof vi.fn>; answer: ReturnType<typeof vi.fn>; connect: () => void
}> }))
vi.mock('../lib/nativeVoice', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/nativeVoice')>(),
  NativeVoiceConnection: class {
    close = vi.fn()
    answer = vi.fn().mockResolvedValue(undefined)
    mute = vi.fn()
    offer = vi.fn().mockResolvedValue('v=0')
    constructor(readonly connect: () => void) { media.instances.push(this) }
  },
}))
afterEach(() => { media.instances.length = 0; vi.useRealTimers() })

function fixture() {
  const listeners = new Set<(event: VoiceEvent) => void>()
  const transport: VoiceTransport = {
    start: vi.fn().mockReturnValue(true), control: vi.fn(),
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
  const hook = renderHook(({ id, connected }) => useNativeVoice(id, transport, connected),
    { initialProps: { id: 'session-1', connected: true } })
  const emit = (event: Partial<VoiceEvent>) => {
    const offer = vi.mocked(transport.start).mock.calls.at(-1)![0]
    act(() => listeners.forEach(listener => listener({ type: 'voiceEvent', seq: 0,
      callId: offer.callId, event: 'started', ...event })))
  }
  return { ...hook, transport, emit, listeners }
}

it('hangup releases media and timers; a stale answer failure cannot end a later call', async () => {
  const f = fixture()
  await act(() => f.result.current.start())
  const first = media.instances[0]
  let reject!: (error: Error) => void
  first.answer.mockReturnValue(new Promise((_, fail) => { reject = fail }))
  f.emit({ event: 'sdp', sdp: 'answer' })
  act(() => f.result.current.stop())
  await act(() => f.result.current.start())
  await act(async () => reject(new Error('old failure')))
  expect(f.result.current.state).toBe('connecting')
  expect(first.close).toHaveBeenCalledTimes(1)
  expect(f.listeners.size).toBe(1)
  f.unmount()
  expect(media.instances[1].close).toHaveBeenCalledTimes(1)
  expect(f.listeners.size).toBe(0)
})

it('stale captions are ignored and session navigation stops the original call', async () => {
  const f = fixture()
  await act(() => f.result.current.start())
  f.emit({ callId: 'old', event: 'transcript', role: 'user', text: 'wrong' })
  expect(f.result.current.transcript.user).toBe('')
  f.emit({ event: 'transcript', role: 'user', text: '你好', done: true })
  expect(f.result.current.transcript.user).toBe('你好')
  f.rerender({ id: 'session-2', connected: true })
  expect(f.transport.control).toHaveBeenCalledWith('session-1', expect.any(String), 'stop')
  expect(f.result.current.state).toBe('idle')
  f.unmount()
})

it('connection timeout and socket loss release the microphone and allow explicit retry', async () => {
  vi.useFakeTimers()
  const f = fixture()
  await act(() => f.result.current.start())
  act(() => vi.advanceTimersByTime(90_000))
  expect(f.result.current.state).toBe('error')
  expect(f.result.current.error).toContain('超时')
  expect(media.instances[0].close).toHaveBeenCalledTimes(1)
  await act(() => f.result.current.start())
  f.rerender({ id: 'session-1', connected: false })
  expect(f.result.current.state).toBe('error')
  expect(media.instances[1].close).toHaveBeenCalledTimes(1)
  f.unmount()
})
