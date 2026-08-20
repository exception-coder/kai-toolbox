import assert from 'node:assert/strict'
import test from 'node:test'
import { GraphifyQueryScheduler, GraphifySchedulerBusyError } from './graphifyQueryScheduler.js'

test('coalesces identical work across callers', async () => {
  const scheduler = new GraphifyQueryScheduler<string>()
  let executions = 0
  let release!: (value: string) => void
  const task = () => {
    executions += 1
    return new Promise<string>(resolve => { release = resolve })
  }

  const first = scheduler.schedule('same', task)
  const second = scheduler.schedule('same', task)
  assert.equal(first.phase, 'active')
  assert.equal(second.phase, 'active')
  release('result')

  assert.equal(await first.promise, 'result')
  assert.equal(await second.promise, 'result')
  assert.equal(executions, 1)
})

test('runs unrelated Graphify work in FIFO order with one active task', async () => {
  const scheduler = new GraphifyQueryScheduler<string>()
  const order: string[] = []
  let releaseFirst!: () => void
  const first = scheduler.schedule('first', async () => {
    order.push('first-start')
    await new Promise<void>(resolve => { releaseFirst = resolve })
    order.push('first-end')
    return 'first'
  })
  const second = scheduler.schedule('second', async () => {
    order.push('second-start')
    return 'second'
  })

  assert.equal(second.phase, 'queued')
  assert.deepEqual(order, ['first-start'])
  releaseFirst()
  assert.equal(await first.promise, 'first')
  assert.equal(await second.promise, 'second')
  assert.deepEqual(order, ['first-start', 'first-end', 'second-start'])
})

test('caches only successful results', async () => {
  const scheduler = new GraphifyQueryScheduler<string>(60_000, 4)
  let executions = 0
  const first = scheduler.schedule('cached', async () => {
    executions += 1
    return 'value'
  })
  assert.equal(await first.promise, 'value')

  const cached = scheduler.schedule('cached', async () => {
    executions += 1
    return 'other'
  })
  assert.equal(cached.cached, true)
  assert.equal(await cached.promise, 'value')
  assert.equal(executions, 1)

  const failed = scheduler.schedule('failed', async () => {
    throw new Error('failure')
  })
  await assert.rejects(failed.promise, /failure/)
  const retry = scheduler.schedule('failed', async () => 'recovered')
  assert.equal(await retry.promise, 'recovered')
})

test('rejects queued work when the scheduler closes', async () => {
  const scheduler = new GraphifyQueryScheduler<string>()
  let release!: () => void
  const active = scheduler.schedule('active', async () => {
    await new Promise<void>(resolve => { release = resolve })
    return 'active'
  })
  const queued = scheduler.schedule('queued', async () => 'queued')

  scheduler.close('shutdown')
  await assert.rejects(queued.promise, /shutdown/)
  assert.throws(() => scheduler.schedule('new', async () => 'new'), /已关闭/)
  release()
  assert.equal(await active.promise, 'active')
})

test('bounds unrelated queued work while still coalescing an existing key', async () => {
  const scheduler = new GraphifyQueryScheduler<string>(60_000, 4, 1)
  let release!: () => void
  const active = scheduler.schedule('active', async () => {
    await new Promise<void>(resolve => { release = resolve })
    return 'active'
  })
  const queued = scheduler.schedule('queued', async () => 'queued')
  assert.equal(scheduler.schedule('queued', async () => 'duplicate').promise, queued.promise)
  assert.throws(
    () => scheduler.schedule('overflow', async () => 'overflow'),
    (error: unknown) => error instanceof GraphifySchedulerBusyError && error.maxQueued === 1,
  )
  release()
  await active.promise
  await queued.promise
})
