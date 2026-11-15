import { expect, it, vi } from 'vitest'
import { gitRead } from './gitRead'

it('ends an unresolved read and ignores its late result without retrying', async () => {
  vi.useFakeTimers()
  try {
    let finish!: (value: string) => void
    const request = new Promise<string>(resolve => { finish = resolve })
    const result = gitRead(request, 50)
    const check = expect(result).rejects.toThrow('读取超时')
    await vi.advanceTimersByTimeAsync(50)
    await check
    finish('late')
    expect(vi.getTimerCount()).toBe(0)
  } finally { vi.useRealTimers() }
})

it('clears the deadline after success or failure', async () => {
  vi.useFakeTimers()
  try {
    await expect(gitRead(Promise.resolve('ok'))).resolves.toBe('ok')
    await expect(gitRead(Promise.reject(new Error('denied')))).rejects.toThrow('denied')
    expect(vi.getTimerCount()).toBe(0)
  } finally { vi.useRealTimers() }
})
