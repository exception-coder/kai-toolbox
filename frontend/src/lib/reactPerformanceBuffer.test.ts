import { afterEach, describe, expect, it, vi } from 'vitest'
import { observeReactPerformanceBuffer } from './reactPerformanceBuffer'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function setupObserver() {
  let callback: PerformanceObserverCallback
  const observe = vi.fn()
  const disconnect = vi.fn()
  class FakeObserver {
    static supportedEntryTypes = ['measure']
    constructor(cb: PerformanceObserverCallback) { callback = cb }
    observe = observe
    disconnect = disconnect
  }
  const clearMeasures = vi.fn()
  const clearMarks = vi.fn()
  const clearResourceTimings = vi.fn()
  vi.stubGlobal('PerformanceObserver', FakeObserver)
  vi.stubGlobal('performance', { clearMeasures, clearMarks, clearResourceTimings })
  return {
    observe, disconnect, clearMeasures, clearMarks, clearResourceTimings,
    deliver(entries: Partial<PerformanceMeasure>[]) {
      callback({ getEntries: () => entries } as PerformanceObserverEntryList, {} as PerformanceObserver)
    },
  }
}

describe('React development performance buffer', () => {
  it('consumes existing and new React measures, keeping unrelated timings intact', () => {
    const mock = setupObserver()
    const stop = observeReactPerformanceBuffer()
    expect(mock.observe).toHaveBeenCalledWith({ type: 'measure', buffered: true })
    mock.deliver([
      { name: '\u200bChat', detail: { devtools: { track: 'Components ⚛' } } },
      { name: '\u200bChat', detail: { devtools: { track: 'Components ⚛' } } },
      { name: 'Update', detail: { devtools: { trackGroup: 'Scheduler ⚛' } } },
      { name: 'business-load', detail: { devtools: { track: 'business' } } },
      { name: 'plain-measure', detail: null },
    ])
    expect(mock.clearMeasures.mock.calls).toEqual([['\u200bChat'], ['Update']])
    expect(mock.clearMarks).not.toHaveBeenCalled()
    expect(mock.clearResourceTimings).not.toHaveBeenCalled()
    mock.clearMeasures.mockClear()
    mock.deliver([{ name: 'NewComponent', detail: { devtools: { track: 'Components ⚛' } } }])
    expect(mock.clearMeasures.mock.calls).toEqual([['NewComponent']])
    stop()
    expect(mock.disconnect).toHaveBeenCalledOnce()
  })

  it('does not block startup on browsers without measure observation', () => {
    vi.stubGlobal('PerformanceObserver', undefined)
    expect(() => observeReactPerformanceBuffer()()).not.toThrow()
    vi.stubGlobal('PerformanceObserver', class { static supportedEntryTypes = ['resource'] })
    expect(() => observeReactPerformanceBuffer()()).not.toThrow()
  })

  it('disconnects if the browser rejects observer registration', () => {
    const mock = setupObserver()
    mock.observe.mockImplementation(() => { throw new Error('unsupported') })
    expect(() => observeReactPerformanceBuffer()).not.toThrow()
    expect(mock.disconnect).toHaveBeenCalledOnce()
  })

  it('releases real User Timing entries while preserving business measures', async () => {
    const native = await import('node:perf_hooks')
    vi.stubGlobal('PerformanceObserver', native.PerformanceObserver)
    vi.stubGlobal('performance', native.performance)
    const stop = observeReactPerformanceBuffer()
    try {
      performance.measure('forge-test-business', { start: 0 })
      for (let i = 0; i < 1000; i++) {
        performance.measure('\u200bForgeTestComponent', {
          start: 0, detail: { devtools: { track: 'Components ⚛' } },
        })
      }
      await vi.waitFor(() => {
        expect(performance.getEntriesByName('\u200bForgeTestComponent', 'measure')).toHaveLength(0)
      })
      expect(performance.getEntriesByName('forge-test-business', 'measure')).toHaveLength(1)
    } finally {
      stop()
      performance.clearMeasures('\u200bForgeTestComponent')
      performance.clearMeasures('forge-test-business')
    }
  })
})
