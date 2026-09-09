import { afterEach, describe, expect, it, vi } from 'vitest'
import { http } from '@/lib/api'
import { graphifyStatus } from './api'

vi.mock('@/lib/api', () => ({ http: vi.fn() }))
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

describe('bounded knowledge status requests', () => {
  it('aborts a slow transport after 15 seconds and reports a recoverable error', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | null | undefined
    vi.mocked(http).mockImplementation((_path, init) => {
      signal = init?.signal
      return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
    })
    const result = expect(graphifyStatus('D:/repo')).rejects.toThrow('状态检测超过 15 秒')
    await vi.advanceTimersByTimeAsync(15_000)
    await result
    expect(signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('forwards cancellation from the caller and clears the deadline', async () => {
    vi.useFakeTimers()
    vi.mocked(http).mockImplementation((_path, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const controller = new AbortController()
    const result = expect(graphifyStatus('D:/repo', controller.signal)).rejects.toThrow('检测已取消')
    controller.abort()
    await result
    expect(vi.getTimerCount()).toBe(0)
  })

  it('releases the UI even if the transport has not reached an abort-aware fetch', async () => {
    vi.useFakeTimers()
    vi.mocked(http).mockImplementation(() => new Promise(() => {}))
    const result = expect(graphifyStatus('D:/repo')).rejects.toThrow('状态检测超过 15 秒')
    await vi.advanceTimersByTimeAsync(15_000)
    await result
    expect(vi.getTimerCount()).toBe(0)
  })
})
