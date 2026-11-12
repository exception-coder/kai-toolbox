// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'

async function freshLog() {
  vi.resetModules()
  return import('./debugLog')
}

describe('diagnostic log memory bounds', () => {
  it('keeps recent events in order with their direction and sequence', async () => {
    const log = await freshLog()
    for (let i = 0; i < 350; i++) log.pushDebug('recv', 'delta', `event ${i}`, i)
    const entries = log.getDebugLog()
    expect(entries).toHaveLength(300)
    expect(entries[0]).toMatchObject({ dir: 'recv', type: 'delta', text: 'event 50', seq: 50 })
    expect(entries.at(-1)?.seq).toBe(349)
    expect(entries.at(-1)!.id).toBeGreaterThan(entries[0].id)
  })

  it('bounds total payload as well as individual entries in both capture modes', async () => {
    const log = await freshLog()
    for (const active of [false, true]) {
      log.clearDebug()
      if (active) log.setDebugViewerActive(true)
      for (let i = 0; i < 350; i++) log.pushDebug('recv', 'history', '中'.repeat(70 * 1024), i)
      const entries = log.getDebugLog()
      const bytes = entries.reduce((sum, entry) => sum + 2 * (entry.text.length + entry.type.length) + 64, 0)
      expect(bytes).toBeLessThanOrEqual((active ? 8 : 1) * 1024 * 1024)
      expect(entries.length).toBeGreaterThan(1)
      expect(entries.at(-1)?.seq).toBe(349)
      expect(entries.every(entry => entry.text.endsWith('…[truncated]'))).toBe(true)
      if (active) log.setDebugViewerActive(false)
    }
  })

  it('shrinks and notifies immediately after the last viewer closes, without new traffic', async () => {
    const log = await freshLog()
    log.setDebugViewerActive(true)
    log.setDebugViewerActive(true)
    for (let i = 0; i < 1000; i++) log.pushDebug('send', 'message', 'x'.repeat(8000), i)
    const listener = vi.fn()
    const unsubscribe = log.subscribeDebug(listener)
    log.setDebugViewerActive(false)
    expect(log.getDebugLog().length).toBeGreaterThan(300)
    expect(listener).not.toHaveBeenCalled()
    const version = log.getDebugVersion()
    log.setDebugViewerActive(false)
    expect(log.getDebugLog().length).toBeLessThanOrEqual(300)
    expect(log.getDebugLog().every(entry => entry.text.length < 4200)).toBe(true)
    expect(log.getDebugLog().at(-1)?.seq).toBe(999)
    expect(log.getDebugVersion()).toBeGreaterThan(version)
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('preserves Unicode and avoids splitting a surrogate pair at the cutoff', async () => {
    const log = await freshLog()
    const original = '中文 🧵 \uD800 standalone'
    log.pushDebug('conn', '状态', original)
    log.pushDebug('recv', 'delta', 'a'.repeat(4095) + '🧵tail')
    expect(log.getDebugLog()[0].text).toBe(original)
    expect(log.getDebugLog()[1].text).toBe('a'.repeat(4095) + '\n…[truncated]')
  })

  it('resets the byte budget on clear and isolates failing subscribers', async () => {
    const log = await freshLog()
    const unsubscribe = log.subscribeDebug(() => { throw new Error('viewer failed') })
    for (let i = 0; i < 150; i++) log.pushDebug('recv', 'history', 'x'.repeat(5000))
    log.clearDebug()
    expect(log.getDebugLog()).toEqual([])
    for (let i = 0; i < 300; i++) log.pushDebug('conn', 'open', 'connected')
    expect(log.getDebugLog()).toHaveLength(300)
    unsubscribe()
  })

  it('does not retain large original reports behind small excerpts after GC', () => {
    // Separate V8 process: a length-only assertion misses SlicedString's parent retention.
    // Probe the actual production module, not a duplicate truncation implementation.
    const source = new URL('./debugLog.ts', import.meta.url).href
    const probe = spawnSync(process.execPath, ['--expose-gc', '--experimental-strip-types', '--input-type=module', '-e', `
      const log = await import(${JSON.stringify(source)});
      function collect() { for (let i = 0; i < 3; i++) global.gc(); }
      collect();
      const baseline = process.memoryUsage().heapUsed;
      for (let i = 0; i < 40; i++) {
        log.pushDebug('recv', 'history', JSON.stringify({ id: i, data: 'x'.repeat(1024 * 1024) }));
      }
      collect();
      const retained = process.memoryUsage().heapUsed - baseline;
      console.log(JSON.stringify({ retained, entries: log.getDebugLog().length }));
    `], { encoding: 'utf8', timeout: 30_000 })
    expect(probe.status, probe.stderr).toBe(0)
    const result = JSON.parse(probe.stdout)
    expect(result.entries).toBe(40)
    // The original implementation retains ~40 MiB; allow ample allocator/version noise.
    expect(result.retained).toBeLessThan(8 * 1024 * 1024)
  })
})
