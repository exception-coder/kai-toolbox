import { afterEach, describe, expect, it, vi } from 'vitest'
import { withAuthRefreshLock } from './authRefreshCoordinator'

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'locks')
})

describe('withAuthRefreshLock', () => {
  it('serializes refresh work through the browser lock manager', async () => {
    let lockTail = Promise.resolve<unknown>(undefined)
    const request = vi.fn((_name: string, _options: { signal: AbortSignal }, callback: () => Promise<unknown>) => {
      const next = lockTail.then(callback)
      lockTail = next.then(() => undefined, () => undefined)
      return next
    })
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request },
    })

    let releaseFirst!: () => void
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve })
    const order: string[] = []
    const first = withAuthRefreshLock(async () => {
      order.push('first:start')
      await firstGate
      order.push('first:end')
    }, 1000)
    const second = withAuthRefreshLock(async () => {
      order.push('second:start')
    }, 1000)

    await Promise.resolve()
    expect(order).toEqual(['first:start'])
    releaseFirst()
    await Promise.all([first, second])

    expect(order).toEqual(['first:start', 'first:end', 'second:start'])
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('stops waiting when another window never releases the refresh lock', async () => {
    const request = vi.fn((_name: string, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
    }))
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request },
    })

    const outcome = await withAuthRefreshLock(async () => 'acquired', 10)

    expect(outcome).toEqual({ acquired: false })
  })
})
