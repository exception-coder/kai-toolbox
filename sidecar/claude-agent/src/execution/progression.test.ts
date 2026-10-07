import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { git } from './repository.js'
import { discoverExecution } from './context.js'
import { assessExecution, checkExecution, finishExecution, inspectExecutionWriter } from './service.js'
import { commitExecution } from './commit.js'
import { runExecutionVerification } from './verification.js'
import { checkExecutionEvent } from './lifecycle.js'
import { executionRecovery } from './recovery.js'
import { captureSpecDependencies, specsCurrent } from './specDependencies.js'
import { resolveSpecs, confirmResolution, checkReadiness } from '../specResolution/service.js'

function fixture(t: test.TestContext, scoped = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-progression-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  git(root, ['init', '-q', '-b', 'main'])
  git(root, ['config', 'user.name', 'Fixture']); git(root, ['config', 'user.email', 'fixture@example.invalid'])
  for (const cap of ['account', 'orders']) {
    fs.mkdirSync(path.join(root, 'openspec/specs', cap), { recursive: true })
    fs.writeFileSync(path.join(root, 'openspec/specs', cap, 'spec.md'), `### Requirement: ${cap}\nOriginal contract.\n`)
  }
  fs.writeFileSync(path.join(root, 'src.js'), 'export const value = 1\n')
  fs.writeFileSync(path.join(root, 'other.js'), 'export const other = 1\n')
  fs.writeFileSync(path.join(root, 'README.md'), 'The existing contract returns one.\n')
  git(root, ['add', 'src.js', 'other.js', 'README.md', 'openspec']); git(root, ['commit', '-qm', 'baseline'])
  const context = { project: root, sessionId: 'one' }
  const discovery = discoverExecution({ ...context, request: 'Preserve account contract', files: ['src.js'],
    ...(scoped ? { specDependencies: ['openspec/specs/account/spec.md'] } : {}) })
  assessExecution({ ...context, discoveryId: discovery.discoveryId, actor: 'fixture', taskId: 'T1', behavior: 'preserved',
    design: 'none', impacts: ['logic'], reason: 'Preserve existing behavior with a reviewed implementation adjustment.',
    evidence: [{ path: 'README.md', quote: 'The existing contract returns one.' }] })
  return { root, context }
}

async function verified(context: { project: string; sessionId: string }) {
  fs.writeFileSync(path.join(context.project, 'src.js'), 'export const value = 2\n')
  const result = await runExecutionVerification({ ...context, inputFiles: ['src.js'], checks: [{ kind: 'regression',
    program: process.execPath, args: ['-e', "require('node:assert/strict').match(require('node:fs').readFileSync('src.js','utf8'), /value = 2/)"] , purpose: 'Verify actual source fixture' }] })
  assert.equal(result.allowed, true)
  const snapshot = inspectExecutionWriter(context)
  return { ...context, executionId: snapshot.writer!.executionId, expectedHead: snapshot.head!,
    expectedScopeFingerprint: snapshot.writer!.scopeFingerprint, message: 'fix(test): verified own execution only' }
}

test('scoped commit preserves foreign staged content, is idempotent and finishes independently', async t => {
  const { root, context } = fixture(t)
  fs.writeFileSync(path.join(root, 'other.js'), 'export const other = 9\n')
  git(root, ['add', 'other.js'])
  const foreign = git(root, ['rev-parse', ':other.js'])
  const request = await verified(context)
  assert.throws(() => checkExecution({ ...context, operation: 'BEFORE_COMMIT' }), /文件超出执行范围/)
  const result = await commitExecution(request)
  assert.equal(git(root, ['show', '--format=', '--name-only', result.commit]), 'src.js')
  assert.equal(git(root, ['rev-parse', ':other.js']), foreign)
  assert.equal(git(root, ['diff', '--cached', '--name-only']), 'other.js')
  assert.equal((await commitExecution(request)).reused, true)
  assert.equal(checkExecutionEvent({ ...context, event: 'STOP' }).allowed, true)
  assert.equal(finishExecution(context).allowed, true)
  assert.equal(git(root, ['diff', '--cached', '--name-only']), 'other.js')
})

test('stale snapshot and rejecting hooks cannot manufacture commit success', async t => {
  const { root, context } = fixture(t)
  const request = await verified(context)
  await assert.rejects(commitExecution({ ...request, expectedHead: 'a'.repeat(40) }), /已变化/)
  const hook = path.join(root, '.git/hooks/pre-commit')
  fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n'); fs.chmodSync(hook, 0o755)
  await assert.rejects(commitExecution(request))
  assert.equal(git(root, ['rev-parse', 'HEAD']), request.expectedHead)
  assert.ok(inspectExecutionWriter(context).writer)
})

test('reviewed dependencies isolate unrelated specs but still reject related changes', t => {
  const { root, context } = fixture(t, true)
  fs.appendFileSync(path.join(root, 'openspec/specs/orders/spec.md'), 'Unrelated revision.\n')
  assert.equal(checkExecution(context).allowed, true)
  fs.appendFileSync(path.join(root, 'openspec/specs/account/spec.md'), 'Account behavior changed.\n')
  assert.throws(() => checkExecution(context), /依赖规格变化/)
})

test('legacy records retain conservative spec checks and errors carry actionable recovery', t => {
  const { root, context } = fixture(t)
  fs.appendFileSync(path.join(root, 'openspec/specs/orders/spec.md'), 'Changed.\n')
  assert.throws(() => checkExecution(context), /正式规格变化/)
  const result = checkExecutionEvent({ ...context, event: 'WRITE', files: ['src.js'] })
  assert.equal(result.allowed, false)
  assert.equal('recovery' in result && result.recovery?.category, 'REBIND')
  assert.equal(executionRecovery('WORKSPACE_BUSY').automaticRetry, false)
  assert.equal(executionRecovery('VERIFICATION_PENDING').category, 'VERIFY_REMAINDER')
})

test('hook rewrites are detected after commit and do not release the writer', async t => {
  const { root, context } = fixture(t)
  const request = await verified(context)
  const hook = path.join(root, '.git/hooks/pre-commit')
  fs.writeFileSync(hook, '#!/bin/sh\nprintf "export const value = 99\\n" > src.js\ngit add src.js\n')
  fs.chmodSync(hook, 0o755)
  await assert.rejects(commitExecution(request), /提交内容与验证快照不一致/)
  assert.notEqual(git(root, ['rev-parse', 'HEAD']), request.expectedHead)
  assert.ok(inspectExecutionWriter(context).writer)
})

test('a previously missing dependency becoming present invalidates its baseline', t => {
  const { root } = fixture(t)
  const file = 'openspec/specs/new-capability/spec.md'
  const baseline = { specRevision: 'old', specDependencies: captureSpecDependencies(root, [file]) }
  assert.equal(specsCurrent(root, baseline, 'other-revision'), true)
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  fs.writeFileSync(path.join(root, file), '### Requirement: new rule\n')
  assert.equal(specsCurrent(root, baseline, 'other-revision'), false)
  assert.throws(() => captureSpecDependencies(root, ['../outside']), /正式 capability/)
})

test('resolution confirmation and readiness share the reviewed dependency boundary', t => {
  const { root } = fixture(t)
  fs.writeFileSync(path.join(root, 'openspec/config.yaml'), 'schema: spec-driven\n')
  fs.mkdirSync(path.join(root, 'openspec/changes/account-fix'), { recursive: true })
  fs.writeFileSync(path.join(root, 'openspec/changes/account-fix/tasks.md'), '- [ ] 1.1 account fix\n')
  const input = { project: root, changeId: 'account-fix', requestId: 'one', specDependencies: ['openspec/specs/account/spec.md'],
    requirements: [{ externalId: 'r1', text: 'account contract', atomic: true, terms: ['account'] }] }
  const result = resolveSpecs(input)
  fs.appendFileSync(path.join(root, 'openspec/specs/orders/spec.md'), 'Unrelated change.\n')
  const decision = { itemId: 'r1', classification: 'NO_SPEC_CHANGE', capabilityId: 'account',
    requirementId: result.items[0].candidates.find(item => item.capabilityId === 'account')!.requirementId,
    reason: 'Preserve the existing account behavior.' }
  assert.throws(() => confirmResolution({ ...input, resolutionId: result.resolutionId, actor: 'reviewer',
    decisions: [{ ...decision, capabilityId: 'orders' }] }), /未登记/)
  confirmResolution({ ...input, resolutionId: result.resolutionId, actor: 'reviewer', decisions: [decision] })
  assert.equal(checkReadiness(input).allowed, true)
  fs.appendFileSync(path.join(root, 'openspec/specs/account/spec.md'), 'Related change.\n')
  assert.throws(() => checkReadiness(input), /依赖规格已变化/)
})
