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
    assert.equal(names.length, 18)
    assert.equal(listed.tools.find(tool => tool.name === 'inspect_store_lock')?.annotations?.readOnlyHint, true)
    assert.equal(listed.tools.find(tool => tool.name === 'recover_store_lock')?.annotations?.destructiveHint, true)
    for (const name of names) assert.ok(listed.tools.some(tool => tool.name === name), name)
    const result = await client.callTool({ name: 'check_change_readiness', arguments: { project: 'not-a-project', changeId: 'test' } })
    assert.equal(result.isError, true)
    assert.match(JSON.stringify(result.content), /CHECK_ERROR/)
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-mcp-execution-'))
    try {
      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root, windowsHide: true })
      fs.writeFileSync(path.join(root, 'source.txt'), 'existing implementation')
      execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'add', 'source.txt'], { cwd: root, windowsHide: true })
      execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'baseline'], { cwd: root, windowsHide: true })
      const initialized = await client.callTool({ name: 'session_init', arguments: { project: root, sessionId: 'forged-session' } })
      assert.equal(initialized.isError, undefined)
      assert.equal(JSON.parse((initialized.content as Array<{ text: string }>)[0].text).sessionId, 'test')
      const candidates = await client.callTool({ name: 'resolve_execution_context', arguments: {
        project: root, sessionId: 'forged-session', request: 'Explore current behavior',
      } })
      assert.equal(candidates.isError, undefined)
      assert.equal(fs.existsSync(path.join(root, '.forge')), false, 'MCP context queries must remain read-only')
      const discovery = await client.callTool({ name: 'discover_execution', arguments: {
        project: root, sessionId: 'forged-session', request: 'Explore current behavior', files: ['source.txt'],
      } })
      assert.equal(discovery.isError, undefined)
      const content = discovery.content as Array<{ text: string }>
      assert.equal(JSON.parse(content[0].text).sessionId, 'test', 'host session must override caller identity')
      const assessment = await client.callTool({ name: 'assess_execution', arguments: {
        project: root, sessionId: 'test', discoveryId: JSON.parse(content[0].text).discoveryId,
        actor: 'fixture', behavior: 'preserved', design: 'none', impacts: ['api'],
        reason: 'Preserve existing behavior and verify the required API category.',
        evidence: [{ path: 'source.txt', quote: 'existing implementation' }],
      } })
      assert.equal(assessment.isError, undefined)
      const verification = (kind: string, command = '') => client.callTool({ name: 'run_execution_verification', arguments: {
        project: root, sessionId: 'test', inputFiles: ['source.txt'], checks: [
          { kind, program: 'node', args: ['-e', command], cwd: root, purpose: '回归验证' },
        ],
      } })
      const pending = await verification('regression')
      assert.equal(pending.isError, undefined, 'successful partial batch is not an MCP failure')
      const pendingBody = JSON.parse((pending.content as Array<{ text: string }>)[0].text)
      assert.equal(pendingBody.allowed, false, 'partial evidence must not authorize delivery')
      assert.equal(pendingBody.code, 'VERIFICATION_PENDING')
      assert.deepEqual(pendingBody.missing, ['api'])
      const complete = await verification('api')
      assert.equal(JSON.parse((complete.content as Array<{ text: string }>)[0].text).code, 'PASS')
      const failed = await verification('regression', 'process.exit(1)')
      assert.equal(failed.isError, true)
      assert.equal(JSON.parse((failed.content as Array<{ text: string }>)[0].text).code, 'VERIFICATION_FAILED')
      fs.writeFileSync(path.join(root, '.forge/spec-resolution/write.lock'), '')
      const inspected = await client.callTool({ name: 'inspect_store_lock', arguments: { project: root } })
      const snapshot = JSON.parse((inspected.content as Array<{ text: string }>)[0].text)
      const recovered = await client.callTool({ name: 'recover_store_lock', arguments: {
        project: root, fingerprint: snapshot.lock.fingerprint, actor: 'fixture',
        reason: 'Test fixture has no legacy process; archive the simulated orphan lock.', legacyProcessesStopped: true,
      } })
      assert.equal(recovered.isError, undefined)
      assert.equal(fs.existsSync(path.join(root, '.forge/spec-resolution/write.lock')), false)
    } finally { fs.rmSync(root, { recursive: true, force: true }) }
  } finally { await client.close() }
})
