import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { CodexCleanupBarriers, observeCodexProcess } from './codexProcessLifetime.js'

function processStub(pid: number) {
  const child = Object.assign(new EventEmitter(), { pid, exitCode: 0 }) as ChildProcessWithoutNullStreams
  return { child, lifetime: observeCodexProcess(child) }
}

test('exit is not close, close is remembered, and repeated waits do not leak child listeners', async () => {
  const { child, lifetime } = processStub(1)
  const keepAlive = setInterval(() => {}, 100)
  try {
    child.emit('exit', 0)
    const checks = await Promise.all(Array.from({ length: 20 }, () => lifetime.wait(5)))
    assert.ok(checks.every(closed => !closed))
    assert.equal(child.listenerCount('close'), 1)
    const pending = lifetime.wait(100)
    child.emit('close', 0)
    assert.equal(await pending, true)
    assert.equal(await lifetime.wait(0), true)
    assert.equal(observeCodexProcess(child), lifetime)
  } finally { clearInterval(keepAlive) }
})

test('spawn ENOENT releases through close without relying on an exit code', async () => {
  const child = spawn('forge-nonexistent-lifecycle-fixture', [], { stdio: 'pipe', windowsHide: true })
  const lifetime = observeCodexProcess(child)
  let errorCode: string | undefined
  child.on('error', error => { errorCode = (error as NodeJS.ErrnoException).code })
  assert.equal(await lifetime.wait(2_000), true)
  assert.equal(errorCode, 'ENOENT')
})

test('a real process remains unclosed under output backpressure and releases after draining', async () => {
  const child = spawn(process.execPath, ['-e', `
    process.stdout.write('x'.repeat(1024*1024), () => process.exit(0));
  `], { stdio: 'pipe', windowsHide: true })
  const lifetime = observeCodexProcess(child)
  try {
    await new Promise<void>(resolve => child.stdout.once('readable', () => resolve()))
    assert.equal(await lifetime.wait(5), false)
  } finally {
    child.stdout.removeAllListeners('readable')
    child.stdout.resume()
    child.stderr.resume()
    assert.equal(await lifetime.wait(3_000), true)
  }
})

test('failed cleanup blocks both session and native aliases until the original close, with auth isolation', async () => {
  const barriers = new CodexCleanupBarriers()
  const first = processStub(11)
  const replacement = processStub(12)
  const keepAlive = setInterval(() => {}, 100)
  try {
    barriers.retain(first.lifetime, 'session', 'thread', '/auth/a')
    await assert.rejects(barriers.verify('session', undefined, '/auth/a', 5), /PID 11/)
    await assert.rejects(barriers.verify('alias', 'thread', '/auth/a', 5), /PID 11/)
    await barriers.verify('session', 'thread', '/auth/b', 5)
    const checking = barriers.verify('session', 'thread', '/auth/a', 100)
    barriers.retain(replacement.lifetime, 'session', 'thread', '/auth/a')
    first.child.emit('close', 0)
    await assert.rejects(checking, /PID 12/)
    replacement.child.emit('close', 0)
    await barriers.verify('session', 'thread', '/auth/a', 5)
    await barriers.verify('alias', 'thread', '/auth/a', 5)
  } finally { clearInterval(keepAlive) }
})
