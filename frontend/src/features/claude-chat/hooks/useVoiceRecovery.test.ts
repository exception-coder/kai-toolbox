import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useVoiceRecovery } from './useVoiceRecovery'

const voice = vi.hoisted(() => ({
  state: 'idle' as 'idle' | 'connecting' | 'connected' | 'error',
  start: vi.fn(),
  stop: vi.fn(),
}))

vi.mock('./useNativeVoice', () => ({
  useNativeVoice: () => ({
    state: voice.state,
    error: null,
    notice: null,
    muted: false,
    start: voice.start,
    stop: voice.stop,
    toggleMute: vi.fn(),
  }),
}))

afterEach(() => {
  sessionStorage.clear()
  voice.state = 'idle'
  voice.start.mockReset()
  voice.stop.mockReset()
})

it('marks recovery only after the realtime connection is confirmed', () => {
  const transport = { start: vi.fn(), control: vi.fn(), subscribe: vi.fn(() => () => undefined) }
  const hook = renderHook(() => useVoiceRecovery('session-1', transport, { connected: true }))

  act(() => hook.result.current.start())
  expect(voice.start).toHaveBeenCalledTimes(1)
  expect(hook.result.current.recoverable).toBe(false)
  expect(sessionStorage.getItem('kai.native-voice-recovery:session-1')).toBeNull()

  voice.state = 'connected'
  hook.rerender()
  expect(hook.result.current.recoverable).toBe(true)
  expect(sessionStorage.getItem('kai.native-voice-recovery:session-1')).toBe('1')
})
