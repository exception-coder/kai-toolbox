import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'
import { definitions } from './tools.js'
import { spawnSync, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('public stdio exposes only Forge product capabilities and refuses removed workflow tools', async () => {
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../toolboxMcpBridge.js', import.meta.url)), 'forge'],
    env: { ...process.env as Record<string, string>, TOOLBOX_API_BASE: 'http://127.0.0.1:1', TOOLBOX_SESSION_ID: 'test' }, stderr: 'pipe' })
  const client = new Client({ name: 'inventory-test', version: '1' })
  try {
    await client.connect(transport)
    const listed = await client.listTools()
    assert.deepEqual(listed.tools.map(tool => tool.name).sort(), [
      'discover_resources', 'execute_resource', 'prepare_page_preview', 'prepare_sql_context',
      'register_pending_sql', 'report_session_progress',
    ])
    for (const definition of definitions) assert.ok(!listed.tools.some(tool => tool.name === definition.name), definition.name)
    const result = await client.callTool({ name: 'session_init', arguments: { project: 'unused', sessionId: 'test' } })
    assert.equal(result.isError, true)
  } finally { await client.close() }
})

/** Exercise the real retained CLI; public MCP no longer carries these contracts. */
function legacyCall(request: { name: string; arguments: unknown }) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./cli.js', import.meta.url)), request.name], {
    input: JSON.stringify(request.arguments), encoding: 'utf8', windowsHide: true, timeout: 20_000,
  })
  assert.ifError(result.error)
  const body = JSON.parse(result.stdout)
  assert.equal(result.status, body.allowed === false ? 2 : 0, result.stderr)
  const pending = body.code === 'VERIFICATION_PENDING' && body.batchStatus === 'PASSED'
  return { content: [{ text: JSON.stringify(body) }], isError: body.allowed === false && !pending ? true : undefined }
}

test('internal CLI retains execution identity, verification and lock recovery', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-mcp-execution-'))
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root, windowsHide: true })
    fs.writeFileSync(path.join(root, 'source.txt'), 'existing implementation')
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'add', 'source.txt'], { cwd: root, windowsHide: true })
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'baseline'], { cwd: root, windowsHide: true })
    const initialized = legacyCall({ name: 'session_init', arguments: { project: root, sessionId: 'test' } })
    assert.equal(initialized.isError, undefined)
    assert.equal(JSON.parse((initialized.content as Array<{ text: string }>)[0].text).sessionId, 'test')
    const candidates = legacyCall({ name: 'resolve_execution_context', arguments: {
      project: root, sessionId: 'test', request: 'Explore current behavior',
    } })
    assert.equal(candidates.isError, undefined)
    assert.equal(fs.existsSync(path.join(root, '.forge')), false, 'CLI context queries must remain read-only')
    const discovery = legacyCall({ name: 'discover_execution', arguments: {
      project: root, sessionId: 'test', request: 'Explore current behavior', files: ['source.txt'],
    } })
    assert.equal(discovery.isError, undefined)
    const content = discovery.content as Array<{ text: string }>
    assert.equal(JSON.parse(content[0].text).sessionId, 'test', 'CLI must retain the original execution session')
    const assessment = legacyCall({ name: 'assess_execution', arguments: {
      project: root, sessionId: 'test', discoveryId: JSON.parse(content[0].text).discoveryId,
      actor: 'fixture', behavior: 'preserved', design: 'none', impacts: ['api'],
      reason: 'Preserve existing behavior and verify the required API category.',
      evidence: [{ path: 'source.txt', quote: 'existing implementation' }],
    } })
    assert.equal(assessment.isError, undefined)
    const verification = (kind: string, command = '') => legacyCall({ name: 'run_execution_verification', arguments: {
      project: root, sessionId: 'test', inputFiles: ['source.txt'], checks: [
        { kind, program: 'node', args: ['-e', command], cwd: root, purpose: '回归验证' },
      ],
    } })
    const pending = await verification('regression')
    assert.equal(pending.isError, undefined, 'successful partial batch preserves its pending status')
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
    const inspected = legacyCall({ name: 'inspect_store_lock', arguments: { project: root } })
    const snapshot = JSON.parse((inspected.content as Array<{ text: string }>)[0].text)
    const recovered = legacyCall({ name: 'recover_store_lock', arguments: {
      project: root, fingerprint: snapshot.lock.fingerprint, actor: 'fixture',
      reason: 'Test fixture has no legacy process; archive the simulated orphan lock.', legacyProcessesStopped: true,
    } })
    assert.equal(recovered.isError, undefined)
    assert.equal(fs.existsSync(path.join(root, '.forge/spec-resolution/write.lock')), false)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
