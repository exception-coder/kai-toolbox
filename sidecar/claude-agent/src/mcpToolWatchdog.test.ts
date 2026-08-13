import assert from 'node:assert/strict'
import test from 'node:test'
import { McpToolWatchdog, isMcpToolEvent } from './mcpToolWatchdog.js'

test('MCP tool without result reaches timeout', async () => {
  const timeout = new Promise<string>(resolve => {
    const watchdog = new McpToolWatchdog({
      timeoutMs: 25,
      heartbeatMs: 10,
      onHeartbeat: () => undefined,
      onTimeout: entry => resolve(entry.toolCallId),
    })
    watchdog.observe({ type: 'toolUse', toolCallId: 'mcp-1', toolName: 'domain/search', toolKind: 'mcp' })
    setTimeout(() => watchdog.observe({
      type: 'toolActivity', toolCallId: 'mcp-1', toolName: 'domain/search', status: 'inProgress',
    }), 10)
  })

  assert.equal(await timeout, 'mcp-1')
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
