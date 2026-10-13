import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JavaFormatClient } from './JavaFormatClient'
import { DEFAULT_JAVA_OPTIONS, type JavaWorkerResponse } from './contracts'

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent<JavaWorkerResponse>) => void) | null = null
  onerror: (() => void) | null = null
  onmessageerror: (() => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() { FakeWorker.instances.push(this) }
  respond(data: JavaWorkerResponse) { this.onmessage?.({ data } as MessageEvent<JavaWorkerResponse>) }
}
beforeEach(() => { FakeWorker.instances = []; vi.stubGlobal('Worker', FakeWorker) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('Java Worker 生命周期', () => {
  it('按需创建、拒绝重复计算；取消后迟到消息不能完成新任务', async () => {
    const client = new JavaFormatClient()
    expect(FakeWorker.instances).toHaveLength(0)
    const first = client.run('first()', DEFAULT_JAVA_OPTIONS)
    const firstError = first.catch(error => error)
    const oldWorker = FakeWorker.instances[0]
    await expect(client.run('duplicate()', DEFAULT_JAVA_OPTIONS)).rejects.toThrow('正在格式化')
    client.cancel()
    expect(await firstError).toBeInstanceOf(Error)
    expect(oldWorker.terminate).toHaveBeenCalledOnce()
    const next = client.run('second()', DEFAULT_JAVA_OPTIONS)
    oldWorker.onerror?.()
    oldWorker.onmessageerror?.()
    oldWorker.respond({ id: 1, result: { ok: true, output: 'old', kind: '表达式' } })
    const worker = FakeWorker.instances[1]
    const request = worker.postMessage.mock.calls[0][0]
    worker.respond({ id: request.id, result: { ok: true, output: 'second()', kind: '表达式' } })
    await expect(next).resolves.toMatchObject({ output: 'second()' })
    client.cancel()
  })
  it('加载失败与超时释放任务，下次可以重试', async () => {
    vi.useFakeTimers()
    const client = new JavaFormatClient()
    const failed = client.run('call()', DEFAULT_JAVA_OPTIONS).catch(error => error)
    FakeWorker.instances[0].onerror?.()
    expect((await failed).message).toContain('加载失败')
    const timeout = client.run('call()', DEFAULT_JAVA_OPTIONS).catch(error => error)
    await vi.advanceTimersByTimeAsync(15_000)
    expect((await timeout).message).toContain('15 秒')
    expect(FakeWorker.instances[1].terminate).toHaveBeenCalledOnce()
  })
})
