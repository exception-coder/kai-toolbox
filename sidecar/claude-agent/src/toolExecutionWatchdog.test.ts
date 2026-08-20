import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ToolExecutionTimeoutAbort,
  ToolExecutionWatchdog,
  isToolExecutionTimeoutAbort,
} from './toolExecutionWatchdog.js'

test('silent non-MCP tool reaches idle timeout', async () => {
  const timeout = new Promise<{ id: string; reason?: string }>(resolve => {
    const watchdog = new ToolExecutionWatchdog({
      idleTimeoutMs: 25,
      maxDurationMs: 100,
      heartbeatMs: 10,
      onHeartbeat: () => undefined,
      onTimeout: entry => resolve({ id: entry.toolCallId, reason: entry.timeoutReason }),
    })
    watchdog.observe({ type: 'toolUse', toolCallId: 'shell-1', toolName: 'shell' })
  })

  assert.deepEqual(await timeout, { id: 'shell-1', reason: 'idle' })
})

test('real progress extends idle deadline but not hard deadline', async () => {
  const startedAt = Date.now()
  const timeout = new Promise<{ reason?: string; elapsed: number }>(resolve => {
    const watchdog = new ToolExecutionWatchdog({
      idleTimeoutMs: 30,
      maxDurationMs: 65,
      heartbeatMs: 10,
      onHeartbeat: () => undefined,
      onTimeout: entry => resolve({ reason: entry.timeoutReason, elapsed: Date.now() - startedAt }),
    })
    watchdog.observe({ type: 'toolUse', toolCallId: 'shell-2', toolName: 'shell' })
    const progress = setInterval(() => watchdog.observe({
      type: 'toolActivity', toolCallId: 'shell-2', status: 'inProgress', detail: 'building',
    }), 15)
    setTimeout(() => clearInterval(progress), 90)
  })

  const result = await timeout
  assert.equal(result.reason, 'maxDuration')
  assert.ok(result.elapsed >= 50)
})

test('other authoritative turn activity keeps a silent yielded shell alive', async () => {
  const startedAt = Date.now()
  const timeout = new Promise<{ reason?: string; elapsed: number }>(resolve => {
    const watchdog = new ToolExecutionWatchdog({
      idleTimeoutMs: 30,
      maxDurationMs: 90,
      heartbeatMs: 10,
      onHeartbeat: () => undefined,
      onTimeout: entry => resolve({ reason: entry.timeoutReason, elapsed: Date.now() - startedAt }),
    })
    watchdog.observe({ type: 'toolUse', toolCallId: 'shell-yielded', toolName: 'shell' })
    const progress = setInterval(() => watchdog.observe({ type: 'assistantDelta', text: '仍在轮询长任务' }), 15)
    setTimeout(() => clearInterval(progress), 55)
  })

  const result = await timeout
  assert.equal(result.reason, 'idle')
  assert.ok(result.elapsed >= 70)
})

test('watchdog heartbeat does not count as upstream progress', async () => {
  const timeout = new Promise<string | undefined>(resolve => {
    const watchdog = new ToolExecutionWatchdog({
      idleTimeoutMs: 25,
      maxDurationMs: 100,
      heartbeatMs: 10,
      onHeartbeat: entry => watchdog.observe({
        type: 'toolActivity', toolCallId: entry.toolCallId, status: 'inProgress', watchdogGenerated: true,
      }),
      onTimeout: entry => resolve(entry.timeoutReason),
    })
    watchdog.observe({ type: 'toolUse', toolCallId: 'dynamic-1', toolName: 'exec' })
  })

  assert.equal(await timeout, 'idle')
})

test('tool result clears deadlines and MCP tools are excluded', async () => {
  let timedOut = false
  const watchdog = new ToolExecutionWatchdog({
    idleTimeoutMs: 20,
    maxDurationMs: 40,
    heartbeatMs: 10,
    onHeartbeat: () => undefined,
    onTimeout: () => { timedOut = true },
  })
  watchdog.observe({ type: 'toolUse', toolCallId: 'shell-3', toolName: 'shell' })
  watchdog.observe({ type: 'toolResult', toolCallId: 'shell-3' })
  watchdog.observe({ type: 'toolUse', toolCallId: 'mcp-1', toolName: 'domain/search', toolKind: 'mcp' })
  await new Promise(resolve => setTimeout(resolve, 50))

  assert.equal(timedOut, false)
})

test('system timeout abort remains distinguishable from user interrupt', () => {
  const reason = new ToolExecutionTimeoutAbort({
    toolCallId: 'shell-timeout',
    toolName: 'shell',
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
    lastTurnActivityAt: Date.now(),
    idleTimeoutMs: 300_000,
    maxDurationMs: 3_600_000,
  })
  assert.equal(isToolExecutionTimeoutAbort(reason), true)
  assert.equal(isToolExecutionTimeoutAbort(new Error('user interrupted')), false)
})
