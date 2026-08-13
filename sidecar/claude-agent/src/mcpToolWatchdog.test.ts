import assert from 'node:assert/strict'
import test from 'node:test'
import { McpToolWatchdog, isMcpToolEvent } from './mcpToolWatchdog.js'

test('MCP tool without result reaches idle timeout with its last reported phase', async () => {
  const timeout = new Promise<{ id: string; reason?: string; detail?: string }>(resolve => {
    const watchdog = new McpToolWatchdog({
      timeoutMs: 25,
      maxDurationMs: 100,
      heartbeatMs: 10,
      onHeartbeat: () => undefined,
      onTimeout: entry => resolve({
        id: entry.toolCallId,
        reason: entry.timeoutReason,
        detail: entry.lastDetail,
      }),
    })
    watchdog.observe({ type: 'toolUse', toolCallId: 'mcp-1', toolName: 'domain/search', toolKind: 'mcp' })
    setTimeout(() => watchdog.observe({
      type: 'toolActivity', toolCallId: 'mcp-1', toolName: 'domain/search', status: 'inProgress',
      title: 'MCP 工具执行中', detail: '步骤 2/4 · 后端处理中',
    }), 10)
  })

  assert.deepEqual(await timeout, {
    id: 'mcp-1',
    reason: 'idle',
    detail: '步骤 2/4 · 后端处理中',
  })
})

test('continuous MCP progress cannot bypass the total-duration deadline', async () => {
  const timeout = new Promise<{ reason?: string; elapsed: number }>(resolve => {
    const startedAt = Date.now()
    const watchdog = new McpToolWatchdog({
      timeoutMs: 30,
      maxDurationMs: 55,
      heartbeatMs: 10,
      onHeartbeat: () => undefined,
      onTimeout: entry => resolve({ reason: entry.timeoutReason, elapsed: Date.now() - startedAt }),
    })
    watchdog.observe({ type: 'toolUse', toolCallId: 'mcp-hard', toolName: 'forge/register', toolKind: 'mcp' })
    const progress = setInterval(() => watchdog.observe({
      type: 'toolActivity', toolCallId: 'mcp-hard', toolName: 'forge/register', status: 'inProgress',
      detail: '后端仍在处理',
    }), 10)
    setTimeout(() => clearInterval(progress), 80)
  })

  const result = await timeout
  assert.equal(result.reason, 'maxDuration')
  assert.ok(result.elapsed < 90)
})

test('MCP result clears timeout', async () => {
  let timedOut = false
  const watchdog = new McpToolWatchdog({
    timeoutMs: 20,
    heartbeatMs: 10,
    onHeartbeat: () => undefined,
    onTimeout: () => { timedOut = true },
  })
  watchdog.observe({ type: 'toolUse', toolCallId: 'mcp-2', toolName: 'mcp__domain__search' })
  watchdog.observe({ type: 'toolResult', toolCallId: 'mcp-2' })
  await new Promise(resolve => setTimeout(resolve, 30))

  assert.equal(timedOut, false)
})

test('ordinary shell work is never tracked as MCP', () => {
  assert.equal(isMcpToolEvent({ type: 'toolUse', toolName: 'shell' }), false)
  assert.equal(isMcpToolEvent({ type: 'toolUse', toolName: 'mcp__domain__search' }), true)
  assert.equal(isMcpToolEvent({ type: 'toolUse', toolName: 'domain_knowledge__search' }), true)
  assert.equal(isMcpToolEvent({ type: 'toolUse', toolName: 'domain/search', toolKind: 'mcp' }), true)
})
