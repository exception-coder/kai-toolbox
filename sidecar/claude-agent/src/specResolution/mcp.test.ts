import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'
import { sdkSpecResolutionTools } from './tools.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

test('real stdio Forge advertises and calls the same resolution contract as SDK', async () => {
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../toolboxMcpBridge.js', import.meta.url)), 'forge'],
    env: { ...process.env as Record<string, string>, TOOLBOX_API_BASE: 'http://127.0.0.1:1', TOOLBOX_SESSION_ID: 'test' }, stderr: 'pipe' })
  const client = new Client({ name: 'resolution-test', version: '1' })
  try {
    await client.connect(transport)
    const listed = await client.listTools()
    const names = sdkSpecResolutionTools().map(tool => tool.name)
    assert.equal(names.length, 11)
    for (const name of names) assert.ok(listed.tools.some(tool => tool.name === name), name)
    const result = await client.callTool({ name: 'check_change_readiness', arguments: { project: 'not-a-project', changeId: 'test' } })
    assert.equal(result.isError, true)
    assert.match(JSON.stringify(result.content), /CHECK_ERROR/)
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-mcp-execution-'))
    try {
      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root, windowsHide: true })
      fs.writeFileSync(path.join(root, 'source.txt'), 'existing implementation')
      const discovery = await client.callTool({ name: 'discover_execution', arguments: {
        project: root, sessionId: 'forged-session', request: 'Explore current behavior', files: ['source.txt'],
      } })
      assert.equal(discovery.isError, undefined)
      const content = discovery.content as Array<{ text: string }>
      assert.equal(JSON.parse(content[0].text).sessionId, 'test', 'host session must override caller identity')
    } finally { fs.rmSync(root, { recursive: true, force: true }) }
  } finally { await client.close() }
})
