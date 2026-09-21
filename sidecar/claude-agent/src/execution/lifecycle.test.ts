import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { git } from './repository.js'
import { initSession } from './session.js'
import { resolveContext, discoverExecution } from './context.js'
import { assessExecution } from './service.js'
import { checkExecutionEvent } from './lifecycle.js'
import { execute } from '../specResolution/tools.js'

function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-plane-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  git(root, ['init', '-q', '-b', 'main'])
  git(root, ['config', 'user.name', 'Fixture']); git(root, ['config', 'user.email', 'fixture@example.invalid'])
  fs.writeFileSync(path.join(root, 'src.js'), 'export const value = 1\n')
  fs.writeFileSync(path.join(root, 'README.md'), 'The existing contract returns one.\n')
  git(root, ['add', 'src.js', 'README.md']); git(root, ['commit', '-qm', 'baseline'])
  const context = { project: root, sessionId: 'one' }
  const bind = () => assessExecution({ ...context,
    discoveryId: discoverExecution({ ...context, request: 'Preserve the existing contract', files: ['src.js'] }).discoveryId,
    actor: 'fixture', taskId: 'T1', behavior: 'preserved', design: 'none', impacts: ['logic'],
    reason: 'Preserve the documented behavior with a local implementation adjustment.',
    evidence: [{ path: 'README.md', quote: 'The existing contract returns one.' }],
  })
  return { root, context, bind }
}

test('session init and context lookup are read-only, including detached HEAD', t => {
  const { root, context } = fixture(t)
  git(root, ['checkout', '--detach', '-q'])
  const before = git(root, ['status', '--porcelain'])
  const session = initSession(context)
  assert.equal(session.execution, null)
  assert.equal(session.branch, null)
  assert.equal(session.workspace.writer, null)
  assert.equal(session.capabilities.execution.authorization, 'NOT_GRANTED')
  assert.equal(session.capabilities.execution.enforcement, 'HOST_DEPENDENT')
  const result = resolveContext({ ...context, request: 'Find existing value behavior' })
  assert.equal(result.graph.status, 'MISSING')
  assert.ok(result.gaps.includes('SPEC_CANDIDATES_EMPTY'))
  assert.equal(fs.existsSync(path.join(root, '.forge')), false)
  assert.equal(git(root, ['status', '--porcelain']), before)
})

test('session resumes the existing task reference without granting another writer', t => {
  const { context, bind } = fixture(t)
  const bound = bind()
  const session = initSession(context)
  assert.equal(session.execution?.executionId, bound.executionId)
  assert.equal(session.execution?.taskId, 'T1')
  assert.equal(session.execution?.ownsWriter, true)
  assert.equal(initSession({ ...context, sessionId: 'two' }).workspace.writer?.ownedBySession, false)
  const denied = checkExecutionEvent({ ...context, sessionId: 'two', event: 'WRITE', files: ['src.js'], legacyMode: 'warn' })
  assert.equal(denied.allowed, false)
  assert.equal(denied.code, 'WORKSPACE_BUSY')
  assert.equal(denied.enforcement, 'block')
})

test('lifecycle centralizes branch, scope, stop and legacy-design decisions', t => {
  const { context, bind } = fixture(t)
  bind()
  const allowed = checkExecutionEvent({ ...context, event: 'WRITE', files: ['src.js'] })
  assert.equal(allowed.allowed, true)
  assert.equal(allowed.legacyGovernanceRequired, false)
  assert.equal(checkExecutionEvent({ ...context, event: 'WRITE', files: ['other.js'] }).code, 'IMPLEMENTATION_SCOPE_DRIFT')
  assert.equal(checkExecutionEvent({ ...context, event: 'GIT', command: 'git switch -c surprise', legacyMode: 'warn' }).code, 'BRANCH_POLICY_DENIED')
  assert.equal(checkExecutionEvent({ ...context, event: 'STOP' }).code, 'VERIFICATION_STALE')
  assert.equal(initSession(context).execution?.ownsWriter, true, 'Stop must not finish/release an execution')
})

test('legacy unbound sessions retain mode and no-OpenSpec compatibility', t => {
  const { root, context } = fixture(t)
  assert.equal(checkExecutionEvent({ ...context, event: 'WRITE', files: ['src.js'] }).allowed, true)
  fs.mkdirSync(path.join(root, 'openspec'))
  fs.writeFileSync(path.join(root, 'openspec/config.yaml'), 'schema: spec-driven\n')
  const result = checkExecutionEvent({ ...context, event: 'WRITE' })
  assert.equal(result.code, 'CHANGE_CONTEXT_MISMATCH')
  assert.equal(result.enforcement, 'warn')
  assert.equal(checkExecutionEvent({ ...context, event: 'WRITE', legacyMode: 'block' }).enforcement, 'block')
  assert.equal(checkExecutionEvent({ ...context, event: 'STOP' }).legacyGovernanceRequired, true)
})

test('malformed state fails closed; tool registration exposes read-only entrypoints', async t => {
  const { root, context, bind } = fixture(t)
  bind()
  fs.writeFileSync(path.join(root, '.forge/spec-resolution/execution-writer.json'), 'invalid json')
  const result = checkExecutionEvent({ ...context, event: 'WRITE', legacyMode: 'warn' })
  assert.equal(result.allowed, false)
  assert.equal(result.enforcement, 'block')
  assert.equal((await execute('session_init', context)).allowed, false)
  const lookup = await execute('resolve_execution_context', { ...context, request: 'Locate source', files: ['src.js'] })
  assert.equal(lookup.protocolVersion, 2)
})
