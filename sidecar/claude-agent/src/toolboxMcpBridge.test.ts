import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

test('three concurrent native stdio bridges initialize and list tools without a backend or model connection', async () => {
  await Promise.all(Array.from({ length: 3 }, async (_, index) => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL('./toolboxMcpBridge.js', import.meta.url)), 'forge'],
      env: { TOOLBOX_API_BASE: 'http://127.0.0.1:1', TOOLBOX_SESSION_ID: `handshake-test-${index}` },
      stderr: 'pipe',
    })
    const client = new Client({ name: 'forge-bridge-test', version: '1' })
    const started = performance.now()
    try {
      await client.connect(transport, { timeout: 15_000 })
      const result = await client.listTools({}, { timeout: 5_000 })
      assert.ok(result.tools.some(tool => tool.name === 'prepare_sql_context'))
      assert.ok(result.tools.some(tool => tool.name === 'execute_resource'))
      console.info(JSON.stringify({ event: 'bridge_handshake_test', index, elapsedMs: Math.round(performance.now() - started) }))
    } finally { await client.close() }
  }))
})
