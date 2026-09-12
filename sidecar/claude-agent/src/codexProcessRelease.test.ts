import assert from 'node:assert/strict'
import test from 'node:test'
import { waitForManagedProcessRelease } from './codexAppServer.js'

test('publishes release after graceful process exit', async () => {
  const actions: string[] = []
  const release = await waitForManagedProcessRelease(
    () => actions.push('close'),
    async () => {
      actions.push('wait')
      return true
    },
    () => actions.push('force'),
  )

  assert.equal(release, 'natural')
  assert.deepEqual(actions, ['close', 'wait'])
})

test('confirms forced process exit before publishing release', async () => {
  const actions: string[] = []
  let waits = 0
  const release = await waitForManagedProcessRelease(
    () => actions.push('close'),
    async () => {
      actions.push('wait')
      waits += 1
      return waits === 2
    },
    () => actions.push('force'),
  )

  assert.equal(release, 'forced')
  assert.deepEqual(actions, ['close', 'wait', 'force', 'wait'])
})

test('rejects release while the managed process is still alive', async () => {
  await assert.rejects(
    waitForManagedProcessRelease(() => undefined, async () => false, () => undefined),
    /强制清理后仍未退出/,
  )
})
