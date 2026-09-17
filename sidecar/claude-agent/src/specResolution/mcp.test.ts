import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'
import { sdkSpecResolutionTools } from './tools.js'

test('real stdio Forge advertises and calls the same resolution contract as SDK', async () => {
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../toolboxMcpBridge.js', import.meta.url)), 'forge'],
    env: { ...process.env as Record<string, string>, TOOLBOX_API_BASE: 'http://127.0.0.1:1', TOOLBOX_SESSION_ID: 'test' }, stderr: 'pipe' })
  const client = new Client({ name: 'resolution-test', version: '1' })
  try {
    await client.connect(transport)
    const listed = await client.listTools()
    const names = sdkSpecResolutionTools().map(tool => tool.name)
    assert.equal(names.length, 4)
    for (const name of names) assert.ok(listed.tools.some(tool => tool.name === name), name)
    const result = await client.callTool({ name: 'check_change_readiness', arguments: { project: 'not-a-project', changeId: 'test' } })
    assert.equal(result.isError, true)
    assert.match(JSON.stringify(result.content), /CHECK_ERROR/)
  } finally { await client.close() }
})
