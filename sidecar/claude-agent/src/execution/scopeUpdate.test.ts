import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { git } from './repository.js'
import { discoverExecution } from './context.js'
import { assessExecution, inspectExecutionWriter, loadExecution, checkDelivery } from './service.js'
import { checkExecutionEvent } from './lifecycle.js'
import { runExecutionVerification } from './verification.js'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { guardExecutionTool } from './guard.js'

function fixture(t: test.TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-update-')))
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
  git(root, ['init', '-q', '-b', 'main'])
  git(root, ['config', 'user.name', 'Fixture'])
  git(root, ['config', 'user.email', 'fixture@example.invalid'])
  fs.writeFileSync(path.join(root, 'README.md'), 'Preserve the existing implementation contract.\n')
  fs.writeFileSync(path.join(root, 'source.ts'), 'export const value = 1\n')
  git(root, ['add', 'README.md', 'source.ts'])
  git(root, ['commit', '-qm', 'baseline'])
  const context = { project: root, sessionId: 'owner' }
  const proposal = (files: string[], sessionId = context.sessionId) => ({ ...context, sessionId,
    discoveryId: discoverExecution({ ...context, sessionId, request: 'Preserve existing implementation', files }).discoveryId,
    actor: 'fixture', taskId: 'T1', behavior: 'preserved' as const, design: 'none' as const,
    impacts: ['logic' as const], reason: 'Include the complete reviewed implementation range.',
    evidence: [{ path: 'README.md', quote: 'Preserve the existing implementation contract.' }] })
  const first = assessExecution(proposal(['source.ts']))
  const update = { executionId: first.executionId, expectedRevision: 0 }
  return { root, context, proposal, first, update }
}

test('owner explicitly extends an existing execution, preserving identity/history and invalidating evidence', async t => {
  const { root, context, proposal, first, update } = fixture(t)
  await runExecutionVerification({ ...context, inputFiles: ['source.ts'], checks: [
    { kind: 'regression', program: process.execPath, args: ['-e', ''], purpose: '原范围回归' }] })
  const before = loadExecution(root, context.sessionId)!
  const request = { ...proposal(['source.ts', 'V096.sql']), update }
  const result = assessExecution(request)
  const after = loadExecution(root, context.sessionId)!
  assert.equal(result.executionId, first.executionId)
  assert.equal(after.baselineHead, before.baselineHead)
  assert.equal(after.verification, undefined)
  assert.deepEqual(after.scopeHistory?.[0].previous, before)
  assert.equal(inspectExecutionWriter({ project: root }).writer?.scopeRevision, 1)
  assert.equal(checkExecutionEvent({ ...context, event: 'WRITE', files: ['V096.sql'] }).allowed, true)
  assert.throws(() => checkDelivery(after), /验证/)
  assert.equal(assessExecution(request).executionId, first.executionId, 'an exact retry is idempotent')
  assert.equal(loadExecution(root, context.sessionId)?.scopeHistory?.length, 1)
  assert.throws(() => assessExecution({ ...proposal(['source.ts', 'V096.sql', 'next.ts']), update }), /版本已变化/)
})

test('implicit update gives a specific recovery path and preserves undeclared-file rejection', t => {
  const { root, context, proposal } = fixture(t)
  const before = loadExecution(root, context.sessionId)
  assert.throws(() => assessExecution(proposal(['source.ts', 'V096.sql'])), { code: 'EXECUTION_UPDATE_REQUIRED' })
  assert.deepEqual(loadExecution(root, context.sessionId), before)
  assert.equal(checkExecutionEvent({ ...context, event: 'WRITE', files: ['V096.sql'] }).code, 'IMPLEMENTATION_SCOPE_DRIFT')
  const rejected = guardExecutionTool(root, context.sessionId, 'Write', { file_path: path.join(root, 'V096.sql') })
  assert.match(rejected!, /IMPLEMENTATION_SCOPE_DRIFT/)
  assert.match(rejected!, /specResolution[\\/]cli\.js/)
})

test('scope updates cannot shrink, cross task/session, or claim another active writer', t => {
  const { root, context, proposal, update } = fixture(t)
  const before = loadExecution(root, context.sessionId)
  assert.throws(() => assessExecution({ ...proposal(['V096.sql']), update }), { code: 'EXECUTION_SCOPE_SHRINK' })
  assert.throws(() => assessExecution({ ...proposal(['source.ts', 'V096.sql']), taskId: 'T2', update }), { code: 'EXECUTION_CONTEXT_MISMATCH' })
  assessExecution(proposal(['other.ts'], 'other'))
  assert.throws(() => assessExecution({ ...proposal(['other.ts'], 'other'), update }), { code: 'EXECUTION_CONTEXT_MISMATCH' })
  assert.throws(() => assessExecution({ ...proposal(['source.ts', 'other.ts']), update }), { code: 'WORKSPACE_BUSY' })
  assert.deepEqual(loadExecution(root, context.sessionId), before)
  assert.equal(inspectExecutionWriter({ project: root }).writers.length, 2)
})

test('scope updates cannot downgrade newly required verification', t => {
  const { context, proposal, update } = fixture(t)
  assessExecution({ ...proposal(['source.ts', 'V096.sql']), impacts: ['logic', 'sql'], update })
  assert.throws(() => assessExecution({ ...proposal(['source.ts', 'V096.sql', 'next.ts']),
    update: { ...update, expectedRevision: 1 } }), { code: 'EXECUTION_POLICY_DOWNGRADE' })
  assert.equal(loadExecution(context.project, context.sessionId)?.scopeHistory?.length, 1)
})

test('verification started before a scope update cannot write old evidence onto the same execution', async t => {
  const { root, context, proposal, update } = fixture(t)
  let changed = false
  await assert.rejects(runExecutionVerification({ ...context, inputFiles: ['source.ts'], checks: [
    { kind: 'regression', program: process.execPath, args: ['-e', ''], purpose: '并发回归' }] }, {
    onProgress: progress => {
      if (!changed && progress.phase === 'completed') {
        assessExecution({ ...proposal(['source.ts', 'V096.sql']), update })
        changed = true
      }
    },
  }), { code: 'VERIFICATION_STALE' })
  assert.equal(changed, true)
  assert.equal(loadExecution(root, context.sessionId)?.verification, undefined)
})

test('internal CLI preserves explicit scope update and existing writer state', t => {
  const { root, context, proposal, update } = fixture(t)
  const description = spawnSync(process.execPath, [fileURLToPath(new URL('../specResolution/cli.js', import.meta.url)), '--describe', 'assess_execution'], {
    encoding: 'utf8', windowsHide: true, timeout: 20_000,
  })
  assert.equal(description.status, 0, description.stderr)
  assert.ok(JSON.parse(description.stdout).inputSchema.properties.update)
  assert.equal(inspectExecutionWriter({ project: root }).writer?.scopeRevision, 0, 'describing a command must not mutate the writer')
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../specResolution/cli.js', import.meta.url)), 'assess_execution'], {
    input: JSON.stringify({ ...proposal(['source.ts', 'V096.sql']), update }),
    encoding: 'utf8', windowsHide: true, timeout: 20_000,
  })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).executionId, update.executionId)
  assert.equal(loadExecution(root, context.sessionId)?.scopeHistory?.length, 1)
})
