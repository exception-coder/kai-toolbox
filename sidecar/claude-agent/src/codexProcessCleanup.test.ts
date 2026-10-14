import assert from 'node:assert/strict'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { waitForCodexClose } from './codexProcessCleanup.js'

test('timeout removes close listener and a later graceful close remains observable', async () => {
  const child = spawn(process.execPath, ['-e', 'process.stdin.resume(); process.stdin.on("end",()=>process.exit(0))'], { stdio: 'pipe' })
  const baseline = child.listenerCount('close')
  assert.equal(await waitForCodexClose(child, 20), false)
  assert.equal(child.listenerCount('close'), baseline)
  const closing = waitForCodexClose(child, 3000)
  child.stdin.end()
  assert.equal(await closing, true)
  assert.equal(await waitForCodexClose(child, 20), true)
})

test('exit with inherited output handles is not treated as process release', async () => {
  const child = Object.assign(new EventEmitter(), {
    exitCode: 0, signalCode: null,
    stdout: { destroyed: false }, stderr: { destroyed: false },
  }) as unknown as ChildProcessWithoutNullStreams
  const keepAlive = setTimeout(() => undefined, 100)
  assert.equal(await waitForCodexClose(child, 20), false)
  const closing = waitForCodexClose(child, 3000)
  child.emit('close', 0)
  assert.equal(await closing, true)
  clearTimeout(keepAlive)
})
