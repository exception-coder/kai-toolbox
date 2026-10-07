import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { git } from './repository.js'
import { developerControl } from './developerControl.js'
import { checkExecutionEvent } from './lifecycle.js'
import { initSession } from './session.js'
import { discoverExecution } from './context.js'
import { assessExecution, loadExecution } from './service.js'
import { runExecutionVerification } from './verification.js'
import { execute } from '../specResolution/tools.js'

function fixture(t: test.TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'developer-control-')))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  git(root, ['init', '-q', '-b', 'main'])
  fs.mkdirSync(path.join(root, '.forge/spec-resolution'), { recursive: true })
  fs.writeFileSync(path.join(root, '.forge/spec-resolution/execution-writers.json'), 'damaged writer')
  fs.writeFileSync(path.join(root, '.forge/spec-resolution/write.lock'), 'legacy blocked lock')
  const set = (enabled: boolean) => fs.writeFileSync(path.join(root, '.forge/execution-control.json'),
    JSON.stringify({ schemaVersion: 1, project: root, enabled, revision: enabled ? 2 : 1 }))
  return { root, set }
}

test('coding first does not launch verification or read execution records', async t => {
  const { root } = fixture(t)
  fs.writeFileSync(path.join(root, '.forge/execution-control.json'), JSON.stringify({ schemaVersion: 1,
    project: root, enabled: true, revision: 1, verificationCadence: 'CODING_FIRST' }))
  const result = await runExecutionVerification({ project: root, sessionId: 'owner',
    inputFiles: ['test.ts'],
    checks: [{ kind: 'regression', purpose: 'must not execute', program: 'missing-program', args: [], cwd: '.' }] })
  assert.equal('code' in result && result.code, 'VERIFICATION_DEFERRED')
  assert.equal('verified' in result && result.verified, false)
  assert.deepEqual(result.executedCheckIds, [])
})

test('developer control bypasses all coding gates before reading a broken writer or store lock', async t => {
  const { root, set } = fixture(t)
  assert.equal(developerControl(root).enabled, true)
  set(false)
  for (const sessionId of ['first', 'second']) {
    const initialized = initSession({ project: root, sessionId })
    assert.equal('executionNotInspected' in initialized && initialized.executionNotInspected, true)
    for (const event of ['WRITE', 'COMMIT', 'GIT', 'STOP']) {
      const result = checkExecutionEvent({ project: root, sessionId, event, files: ['V096.sql'], command: 'git switch branch' })
      assert.equal(result.allowed, true)
      assert.equal(result.code, 'GOVERNANCE_DISABLED')
      assert.equal(result.legacyGovernanceRequired, false)
    }
  }
  for (const name of ['discover_execution', 'assess_execution', 'check_execution_readiness', 'check_change_readiness',
    'finish_execution', 'confirm_spec_resolution', 'run_execution_verification']) {
    const result = await execute(name, { project: root, sessionId: 'first' })
    assert.equal(result.code, 'GOVERNANCE_DISABLED', name)
    assert.equal(result.verified, false)
    assert.equal(result.completed, false)
  }
  assert.equal(fs.readFileSync(path.join(root, '.forge/spec-resolution/execution-writers.json'), 'utf8'), 'damaged writer')
  assert.equal(fs.readFileSync(path.join(root, '.forge/spec-resolution/write.lock'), 'utf8'), 'legacy blocked lock')
  set(true)
  assert.equal(checkExecutionEvent({ project: root, sessionId: 'first', event: 'WRITE' }).allowed, false)
})

test('project controls remain isolated and malformed settings do not silently disable checks', t => {
  const { root, set } = fixture(t)
  const other = fixture(t)
  set(false)
  assert.equal(developerControl(other.root).enabled, true)
  fs.writeFileSync(path.join(root, '.forge/execution-control.json'), JSON.stringify({ schemaVersion: 1, project: root, revision: 1 }))
  assert.throws(() => developerControl(root), /配置无效/)
})


test('in-flight verification cannot save after control changes, even if gates have been enabled again', async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'developer-verification-')))
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
  git(root, ['init', '-q', '-b', 'main'])
  git(root, ['config', 'user.name', 'Fixture'])
  git(root, ['config', 'user.email', 'fixture@example.invalid'])
  fs.writeFileSync(path.join(root, 'README.md'), 'Preserve behavior.')
  fs.writeFileSync(path.join(root, 'source.ts'), 'export const value = 1')
  git(root, ['add', 'README.md', 'source.ts'])
  git(root, ['commit', '-qm', 'baseline'])
  const context = { project: root, sessionId: 'owner' }
  const discovery = discoverExecution({ ...context, request: 'preserve implementation', files: ['source.ts'] })
  assessExecution({ ...context, discoveryId: discovery.discoveryId, actor: 'fixture', taskId: 'T1',
    behavior: 'preserved', design: 'none', impacts: ['logic'], reason: 'Preserve existing implementation.',
    evidence: [{ path: 'README.md', quote: 'Preserve behavior.' }] })
  const before = loadExecution(root, context.sessionId)
  await assert.rejects(runExecutionVerification({ ...context, inputFiles: ['source.ts'], checks: [
    { kind: 'regression', program: process.execPath, args: ['-e', ''], purpose: 'switch race' }] }, {
    onProgress: progress => {
      if (progress.phase === 'completed') {
        fs.writeFileSync(path.join(root, '.forge/execution-control.json'),
          JSON.stringify({ schemaVersion: 1, project: root, enabled: true, revision: 2 }))
      }
    },
  }), { code: 'EXECUTION_CONTROL_CHANGED' })
  assert.deepEqual(loadExecution(root, context.sessionId), before)
})
