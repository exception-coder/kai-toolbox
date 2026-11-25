import { afterEach, describe, expect, it, vi } from 'vitest'
import { localDocumentRequest } from './localDocumentRequest'

afterEach(() => vi.useRealTimers())
describe('local document read deadline', () => {
  it('bounds a stalled read even when it ignores cancellation, and aborts its transport', async () => {
    vi.useFakeTimers()
    let transport: AbortSignal | undefined
    const result = localDocumentRequest(signal => { transport = signal; return new Promise(() => {}) })
    const assertion = expect(result).rejects.toThrow('文件读取超时')
    await vi.advanceTimersByTimeAsync(20_000)
    await assertion
    expect(transport?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('cancels immediately when switching sessions without waiting for the deadline', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const result = localDocumentRequest(() => new Promise(() => {}), controller.signal)
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })
  it('does not start an already cancelled read', async () => {
    const controller = new AbortController()
    controller.abort()
    const read = vi.fn()
    await expect(localDocumentRequest(read, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(read).not.toHaveBeenCalled()
  })
  it('returns content and clears the deadline after success', async () => {
    vi.useFakeTimers()
    await expect(localDocumentRequest(async () => '# document')).resolves.toBe('# document')
    expect(vi.getTimerCount()).toBe(0)
  })
})
