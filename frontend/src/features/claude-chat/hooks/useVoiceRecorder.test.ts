import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useVoiceRecorder } from './useVoiceRecorder'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('releases late microphone permission after leaving the consultation', async () => {
  let grant!: (stream: MediaStream) => void
  const getUserMedia = vi.fn().mockReturnValue(new Promise(resolve => { grant = resolve }))
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  const recorder = vi.fn()
  vi.stubGlobal('MediaRecorder', recorder)
  const hook = renderHook(useVoiceRecorder)
  let request!: Promise<void>
  act(() => { request = hook.result.current.start(); void hook.result.current.start() })
  expect(getUserMedia).toHaveBeenCalledOnce()
  hook.unmount()
  const stop = vi.fn()
  await act(async () => { grant({ getTracks: () => [{ stop }] } as unknown as MediaStream); await request })
  expect(stop).toHaveBeenCalledOnce()
  expect(recorder).not.toHaveBeenCalled()
})

it('stops recorder and microphone when the owning view closes', async () => {
  const stopTrack = vi.fn(), stopRecorder = vi.fn()
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) } })
  vi.stubGlobal('MediaRecorder', class { state = 'recording'; start = vi.fn(); stop = stopRecorder })
  const hook = renderHook(useVoiceRecorder)
  await act(async () => hook.result.current.start())
  expect(hook.result.current.recording).toBe(true)
  hook.unmount()
  expect(stopRecorder).toHaveBeenCalledOnce()
  expect(stopTrack).toHaveBeenCalledOnce()
})
