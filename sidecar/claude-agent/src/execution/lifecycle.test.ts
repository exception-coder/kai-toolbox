import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { git } from './repository.js'
import { initSession } from './session.js'
import { resolveContext, discoverExecution } from './context.js'
import { abortExecution, assessExecution, inspectExecutionWriter } from './service.js'
import { checkExecutionEvent } from './lifecycle.js'
import { runExecutionVerification } from './verification.js'
import { execute } from '../specResolution/tools.js'
import { locked } from '../specResolution/storage.js'
import { inspectStoreLock, recoverStoreLock } from './storeRecovery.js'
import { executionScopes, scopesConflict } from './writers.js'
import { spawnSync } from 'node:child_process'

function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-plane-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
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

test('aborted execution cannot be resurrected with identical assessment', t => {
  const { root, context, bind } = fixture(t)
  const first = bind()
  const snapshot = inspectExecutionWriter({ project: root })
  abortExecution({ project: root, executionId: first.executionId, ownerSessionId: context.sessionId,
    branch: snapshot.branch, expectedHead: snapshot.head, expectedScopeFingerprint: snapshot.writer!.scopeFingerprint,
    actor: 'operator', reason: 'Abort this execution and keep all source files for a fresh task.' })
  const next = bind()
  assert.notEqual(next.executionId, first.executionId)
  assert.equal(bind().executionId, next.executionId, 'retry reuses the new active execution')
  assert.equal(checkExecutionEvent({ ...context, event: 'WRITE', files: ['src.js'] }).allowed, true)
  const old = JSON.parse(fs.readFileSync(path.join(root, `.forge/spec-resolution/${first.executionId}.json`), 'utf8'))
  assert.equal(old.release.status, 'ABORTED')
})

test('abort rejects content drift even when HEAD and porcelain status stay unchanged', t => {
  const { root, context, bind } = fixture(t)
  const first = bind()
  fs.writeFileSync(path.join(root, 'src.js'), 'export const value = 2\n')
  const snapshot = inspectExecutionWriter({ project: root })
  fs.writeFileSync(path.join(root, 'src.js'), 'export const value = 3\n')
  assert.throws(() => abortExecution({ project: root, executionId: first.executionId, ownerSessionId: context.sessionId,
    branch: snapshot.branch, expectedHead: snapshot.head, expectedScopeFingerprint: snapshot.writer!.scopeFingerprint,
    actor: 'operator', reason: 'Abort after inspecting the original snapshot of changed files.' }), /已变化/)
  assert.equal(inspectExecutionWriter({ project: root }).writer?.executionId, first.executionId)
})

test('a process exiting inside storage transaction does not permanently block development', t => {
  const { root } = fixture(t)
  const moduleUrl = new URL('../specResolution/storage.js', import.meta.url).href
  const child = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { locked } from ${JSON.stringify(moduleUrl)}; locked(${JSON.stringify(root)}, () => process.exit(23))`])
  assert.equal(child.status, 23)
  assert.equal(locked(root, () => 'recovered'), 'recovered')
})

test('a second process cannot enter a live storage transaction', t => {
  const { root } = fixture(t)
  const moduleUrl = new URL('../specResolution/storage.js', import.meta.url).href
  locked(root, () => {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import { locked } from ${JSON.stringify(moduleUrl)}; try { locked(${JSON.stringify(root)}, () => process.exit(42)) } catch(e) { process.exit(e.code === 'SPEC_STORE_BUSY' ? 24 : 25) }`])
    assert.equal(child.status, 24)
  })
  assert.equal(locked(root, () => 'available'), 'available')
})

test('an interrupted terminal release is completed before binding the next writer', t => {
  const { root, bind } = fixture(t)
  const first = bind()
  const file = path.join(root, `.forge/spec-resolution/${first.executionId}.json`)
  const record = JSON.parse(fs.readFileSync(file, 'utf8'))
  record.release = { status: 'COMPLETED', releasedAt: new Date().toISOString(), commit: git(root, ['rev-parse', 'HEAD']) }
  fs.writeFileSync(file, JSON.stringify(record))
  const next = bind()
  assert.notEqual(next.executionId, first.executionId)
  assert.equal(inspectExecutionWriter({ project: root }).writer?.executionId, next.executionId)
})

test('branch drift has an explicit abort recovery without switching the workspace', t => {
  const { root, context, bind } = fixture(t)
  const first = bind()
  git(root, ['checkout', '--detach', '-q'])
  const snapshot = inspectExecutionWriter({ project: root })
  assert.equal(snapshot.branch, '')
  abortExecution({ project: root, executionId: first.executionId, ownerSessionId: context.sessionId,
    branch: 'main', expectedCurrentBranch: '', expectedHead: snapshot.head, expectedScopeFingerprint: snapshot.writer!.scopeFingerprint,
    actor: 'operator', reason: 'Explicitly abandon the old execution while preserving detached checkout.' })
  assert.equal(inspectExecutionWriter({ project: root }).writer, null)
  assert.equal(git(root, ['branch', '--show-current']), '')
})

test('legacy store recovery checks snapshot and keeps audited original lock', t => {
  const { root } = fixture(t)
  const file = path.join(root, '.forge/spec-resolution/write.lock')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '')
  assert.throws(() => locked(root, () => true), /旧版存储锁/)
  const snapshot = inspectStoreLock({ project: root })
  const input = { project: root, fingerprint: snapshot.lock!.fingerprint, actor: 'operator',
    reason: 'All old version writers have stopped; preserve and retire the orphan lock.', legacyProcessesStopped: true }
  assert.throws(() => recoverStoreLock({ ...input, fingerprint: '0'.repeat(64) }), /现场变化/)
  const result = recoverStoreLock(input)
  assert.ok(fs.existsSync(path.join(path.dirname(file), `${result.auditId}.lock`)))
  assert.equal(locked(root, () => 'available'), 'available')
})

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

test('verification accumulates bounded checks for the same inputs and invalidates changed inputs', async t => {
  const { root, context, bind } = fixture(t)
  bind()
  const check = (kind: string) => ({ kind, program: process.execPath, args: ['-e', 'process.stdout.write("ok")'], purpose: `${kind} verification check` })
  const first = await runExecutionVerification({ ...context, inputFiles: ['src.js'], checks: [check('regression')] })
  assert.equal(first.results.length, 1)
  const second = await runExecutionVerification({ ...context, inputFiles: ['src.js'], checks: [check('api')] })
  assert.deepEqual(second.results.map(result => result.kind), ['regression', 'api'])
  fs.writeFileSync(path.join(root, 'src.js'), 'export const value = 2\n')
  const changed = await runExecutionVerification({ ...context, inputFiles: ['src.js'], checks: [check('api')] })
  assert.deepEqual(changed.results.map(result => result.kind), ['api'])
})

test('fast checks are not rejected by summed timeout ceilings and accept absolute project paths', async t => {
  const { root, context, bind } = fixture(t)
  bind()
  const result = await runExecutionVerification({ ...context, inputFiles: [path.join(root, 'src.js')], timeoutMs: 120000,
    checks: ['one', 'two', 'three'].map(purpose => ({ kind: 'regression', program: 'node', args: ['-e', 'void '+JSON.stringify(purpose)], cwd: root, purpose })) })
  assert.equal(result.code, 'PASS')
  assert.equal(result.results.length, 3)
  await assert.rejects(runExecutionVerification({ ...context, inputFiles: ['src.js'], checks: [
    { kind: 'regression', program: 'node', args: ['-e', ''], cwd: path.dirname(root), purpose: '越界检查' },
  ] }), /路径/)
})

test('all paths are preflighted before executing any command', async t => {
  const { root, context, bind } = fixture(t)
  bind()
  await assert.rejects(runExecutionVerification({ ...context, inputFiles: ['src.js'], checks: [
    { kind: 'regression', program: 'node', args: ['-e', 'require("fs").writeFileSync("should-not-exist", "bad")'], purpose: '前置检查' },
    { kind: 'regression', program: 'node', args: ['-e', ''], cwd: '../outside', purpose: '无效路径' },
  ] }), /路径/)
  assert.equal(fs.existsSync(path.join(root, 'should-not-exist')), false)
})

test('deferred checks persist and block commit readiness until actually executed', async t => {
  const { context, bind } = fixture(t)
  bind()
  const checks = [{ kind: 'regression', program: 'node', args: ['-e', ''], purpose: '真实检查' }]
  const pending = await runExecutionVerification({ ...context, inputFiles: ['src.js'], checks }, { budgetMs: 0 })
  assert.equal(pending.code, 'VERIFICATION_PENDING')
  assert.equal(pending.allowed, false)
  assert.equal(pending.pendingChecks.length, 1)
  assert.equal(checkExecutionEvent({ ...context, event: 'COMMIT' }).allowed, false)
  const completed = await runExecutionVerification({ ...context, inputFiles: ['src.js'], checks: pending.pendingChecks })
  assert.equal(completed.code, 'PASS')
  assert.deepEqual(completed.pendingChecks, [])
})

test('different modules run together while shared files and the same module remain exclusive', t => {
  const { root } = fixture(t)
  for (const module of ['alpha', 'beta']) {
    fs.mkdirSync(path.join(root, module))
    fs.writeFileSync(path.join(root, module, 'pom.xml'), '<project/>')
    fs.writeFileSync(path.join(root, module, 'Main.java'), `class ${module} {}`)
  }
  fs.writeFileSync(path.join(root, 'pom.xml'), '<project/>')
  git(root, ['add', 'alpha', 'beta', 'pom.xml']); git(root, ['commit', '-qm', 'modules'])
  const bind = (sessionId: string, files: string[]) => {
    const context = { project: root, sessionId }
    return assessExecution({ ...context, discoveryId: discoverExecution({ ...context,
      request: 'Preserve module behavior', files }).discoveryId,
      actor: 'fixture', behavior: 'preserved', design: 'none', impacts: ['logic'],
      reason: 'Keep module behavior while changing its local implementation.',
      evidence: [{ path: 'README.md', quote: 'The existing contract returns one.' }] })
  }
  const alpha = bind('alpha-session', ['alpha/Main.java'])
  const beta = bind('beta-session', ['beta/Main.java'])
  assert.equal(inspectExecutionWriter({ project: root }).writers.length, 2)
  assert.equal(initSession({ project: root, sessionId: 'beta-session' }).execution?.ownsWriter, true)
  assert.equal(checkExecutionEvent({ project: root, sessionId: 'alpha-session', event: 'WRITE', files: ['alpha/Main.java'] }).allowed, true)
  assert.equal(checkExecutionEvent({ project: root, sessionId: 'beta-session', event: 'WRITE', files: ['beta/Main.java'] }).allowed, true)
  fs.writeFileSync(path.join(root, 'beta/Main.java'), 'class beta { int value; }')
  git(root, ['add', 'beta/Main.java'])
  assert.equal(checkExecutionEvent({ project: root, sessionId: 'alpha-session', event: 'COMMIT' }).code, 'IMPLEMENTATION_SCOPE_DRIFT')
  git(root, ['reset', '-q', '--', 'beta/Main.java'])
  fs.writeFileSync(path.join(root, 'beta/Main.java'), 'class beta {}')
  assert.throws(() => bind('third', ['alpha/pom.xml']), /已有写入会话/)
  assert.throws(() => bind('shared', ['pom.xml']), /已有写入会话/)
  const snapshot = inspectExecutionWriter({ project: root })
  const target = snapshot.writers.find(writer => writer.executionId === alpha.executionId)!
  abortExecution({ project: root, executionId: alpha.executionId, ownerSessionId: 'alpha-session',
    branch: snapshot.branch, expectedHead: snapshot.head, expectedScopeFingerprint: target.scopeFingerprint,
    actor: 'operator', reason: 'Release only the alpha module after checking its unchanged state.' })
  assert.deepEqual(inspectExecutionWriter({ project: root }).writers.map(writer => writer.executionId), [beta.executionId])
  assert.equal(initSession({ project: root, sessionId: 'beta-session' }).execution?.ownsWriter, true)
})

test('module documentation and local migrations stay scoped while repository build files remain global', t => {
  const { root } = fixture(t)
  for (const module of ['alpha', 'beta']) {
    fs.mkdirSync(path.join(root, module))
    fs.writeFileSync(path.join(root, module, 'pom.xml'), '<project/>')
  }
  const alpha = executionScopes(root, ['alpha/Main.java', 'docs/design/alpha.md', 'openspec/changes/alpha/tasks.md'])
  const beta = executionScopes(root, ['beta/Main.java', 'docs/design/beta.md', 'openspec/changes/beta/tasks.md'])
  assert.equal(scopesConflict(alpha, beta), false)
  assert.equal(scopesConflict(alpha, executionScopes(root, ['docs/design/alpha.md'])), true)
  assert.equal(scopesConflict(alpha, executionScopes(root, ['openspec/changes/alpha/design.md'])), true)
  assert.equal(scopesConflict(alpha, executionScopes(root, ['pom.xml'])), true)
  assert.equal(scopesConflict(alpha, executionScopes(root, ['beta/db/migration/V1.sql'])), false)
  assert.equal(scopesConflict(beta, executionScopes(root, ['beta/db/migration/V1.sql'])), true)
  assert.equal(scopesConflict(alpha, executionScopes(root, ['db/migration/V1.sql'])), true)
})

test('different frontend features can write concurrently while exact shared files and build roots remain exclusive', t => {
  const { root } = fixture(t)
  fs.mkdirSync(path.join(root, 'frontend/src/features/accounts'), { recursive: true })
  fs.mkdirSync(path.join(root, 'frontend/src/features/orders'), { recursive: true })
  fs.mkdirSync(path.join(root, 'frontend/src/lib'), { recursive: true })
  fs.writeFileSync(path.join(root, 'frontend/package.json'), '{}')
  const accounts = executionScopes(root, ['frontend/src/features/accounts/Page.tsx'])
  const orders = executionScopes(root, ['frontend/src/features/orders/Page.tsx'])
  assert.deepEqual(accounts, ['module:frontend/src/features/accounts'])
  assert.equal(scopesConflict(accounts, orders), false)
  assert.equal(scopesConflict(accounts, executionScopes(root, ['frontend/src/features/accounts/api.ts'])), true)
  const shared = executionScopes(root, ['frontend/src/lib/api.ts'])
  assert.deepEqual(shared, ['file:frontend/src/lib/api.ts'])
  assert.equal(scopesConflict(accounts, shared), false)
  assert.equal(scopesConflict(shared, executionScopes(root, ['frontend/src/lib/api.ts'])), true)
  assert.equal(scopesConflict(accounts, executionScopes(root, ['frontend/package.json'])), true)
  assert.equal(scopesConflict(orders, executionScopes(root, ['frontend/tsconfig.json'])), true)
  assert.equal(scopesConflict(['module:frontend'], accounts), true)
  assert.equal(scopesConflict(accounts, ['module:frontend']), true)
})

test('another module commit cannot reclaim a verified but uncommitted module writer', async t => {
  const { root } = fixture(t)
  for (const module of ['alpha', 'beta']) {
    fs.mkdirSync(path.join(root, module))
    fs.writeFileSync(path.join(root, module, 'pom.xml'), '<project/>')
    fs.writeFileSync(path.join(root, module, 'Main.java'), `class ${module} {}`)
  }
  git(root, ['add', 'alpha', 'beta']); git(root, ['commit', '-qm', 'modules'])
  const context = { project: root, sessionId: 'one' }
  const old = assessExecution({ ...context, discoveryId: discoverExecution({ ...context,
    request: 'Change alpha locally', files: ['alpha/Main.java'] }).discoveryId,
    actor: 'fixture', behavior: 'preserved', design: 'none', impacts: ['logic'],
    reason: 'Preserve alpha behavior while changing local implementation.',
    evidence: [{ path: 'README.md', quote: 'The existing contract returns one.' }] })
  const verified = await runExecutionVerification({ ...context, inputFiles: ['alpha/Main.java'], checks: [
    { kind: 'regression', program: process.execPath, args: ['-e', 'process.exit(0)'], purpose: 'Verify unchanged alpha module' },
  ] })
  assert.equal(verified.allowed, true)
  fs.writeFileSync(path.join(root, 'beta/Main.java'), 'class beta { int value; }')
  git(root, ['add', 'beta/Main.java']); git(root, ['commit', '-qm', 'beta commit'])
  const next = { project: root, sessionId: 'two' }
  assert.throws(() => assessExecution({ ...next, discoveryId: discoverExecution({ ...next,
    request: 'Take alpha work', files: ['alpha/Main.java'] }).discoveryId,
    actor: 'fixture', behavior: 'preserved', design: 'none', impacts: ['logic'],
    reason: 'Attempt to take alpha after an unrelated beta commit.',
    evidence: [{ path: 'README.md', quote: 'The existing contract returns one.' }] }), /已有写入会话/)
  assert.equal(inspectExecutionWriter({ project: root }).writer?.executionId, old.executionId)
})

test('an unrelated passing batch cannot erase a failed check; explicit replacement must pass', async t => {
  const { context, bind } = fixture(t)
  bind()
  const failed = await runExecutionVerification({ ...context, inputFiles: ['src.js'], checks: [
    { kind: 'regression', program: 'node', args: ['-e', 'process.exit(1)'], purpose: '失败检查' },
  ] })
  assert.equal(failed.code, 'VERIFICATION_FAILED')
  const unrelated = await runExecutionVerification({ ...context, inputFiles: ['src.js'], checks: [
    { kind: 'api', program: 'node', args: ['-e', ''], purpose: '其它检查' },
  ] })
  assert.equal(unrelated.code, 'VERIFICATION_FAILED')
  assert.equal(unrelated.results.filter(result => result.status === 'FAILED').length, 1)
  const fixed = await runExecutionVerification({ ...context, inputFiles: ['src.js'], checks: [
    { kind: 'regression', program: 'node', args: ['-e', ''], purpose: '已修正命令', replaces: failed.results[0].checkId },
  ] })
  assert.equal(fixed.code, 'PASS')
})

test('verification reports progress and does not save cancelled results', async t => {
  const { root, context, bind } = fixture(t)
  const execution = bind()
  const check = { kind: 'regression', program: process.execPath,
    args: ['-e', 'process.stdout.write("ready"); setTimeout(() => {}, 1000)'], purpose: 'Cancellation regression' }
  const controller = new AbortController()
  const phases: string[] = []
  const result = runExecutionVerification({ ...context, inputFiles: ['src.js'], checks: [check] }, {
    signal: controller.signal,
    onProgress: event => { phases.push(event.phase); if (event.phase === 'output') controller.abort() },
  })
  await assert.rejects(result, /验证调用已取消/)
  assert.ok(phases.includes('started'))
  assert.ok(phases.includes('output'))
  const saved = JSON.parse(fs.readFileSync(path.join(root, `.forge/spec-resolution/${execution.executionId}.json`), 'utf8'))
  assert.equal(saved.verification, undefined)
  await new Promise(resolve => setTimeout(resolve, 1200))
})

test('a new session reclaims only a verified committed and clean stale writer', async t => {
  const { root, context, bind } = fixture(t)
  const oldExecution = bind()
  fs.writeFileSync(path.join(root, 'src.js'), 'export const value = 2\n')
  const verification = await runExecutionVerification({ ...context, inputFiles: ['src.js'],
    checks: [{ kind: 'regression', program: process.execPath,
      args: ['-e', "require('node:assert/strict').match(require('node:fs').readFileSync('src.js','utf8'), /value = 2/)"],
      purpose: 'Prove the completed execution contains the expected value' }] })
  assert.equal(verification.allowed, true)
  git(root, ['add', 'src.js']); git(root, ['commit', '-qm', 'complete old execution'])

  const next = { project: root, sessionId: 'two' }
  const discovery = discoverExecution({ ...next, request: 'Continue with another scoped task', files: ['src.js'] })
  const replacement = assessExecution({ ...next, discoveryId: discovery.discoveryId, actor: 'fixture',
    behavior: 'preserved', design: 'none', impacts: ['logic'],
    reason: 'Continue after the previous verified and committed execution completed.',
    evidence: [{ path: 'README.md', quote: 'The existing contract returns one.' }] })

  assert.notEqual(replacement.executionId, oldExecution.executionId)
  assert.equal(initSession(next).execution?.ownsWriter, true)
  assert.equal(initSession(context).execution, null)
  const oldRecord = JSON.parse(fs.readFileSync(path.join(root, `.forge/spec-resolution/${oldExecution.executionId}.json`), 'utf8'))
  assert.equal(oldRecord.release.status, 'AUTO_RECLAIMED')
  assert.equal(oldRecord.release.reclaimedBySessionId, 'two')
})

test('a new session cannot reclaim an unverified, uncommitted or dirty writer', async t => {
  const { root, context, bind } = fixture(t)
  bind()
  const next = { project: root, sessionId: 'two' }
  const assessNext = () => assessExecution({ ...next,
    discoveryId: discoverExecution({ ...next, request: 'Attempt another scoped task', files: ['src.js'] }).discoveryId,
    actor: 'fixture', behavior: 'preserved', design: 'none', impacts: ['logic'],
    reason: 'Attempt work while the previous execution remains incomplete.',
    evidence: [{ path: 'README.md', quote: 'The existing contract returns one.' }] })
  assert.throws(assessNext, /已有写入会话/)

  fs.writeFileSync(path.join(root, 'src.js'), 'export const value = 2\n')
  await runExecutionVerification({ ...context, inputFiles: ['src.js'], checks: [{ kind: 'regression', program: process.execPath,
    args: ['-e', "require('node:assert/strict').match(require('node:fs').readFileSync('src.js','utf8'), /value = 2/)"],
    purpose: 'Prove the changed value before checking stale lock recovery' }] })
  git(root, ['add', 'src.js']); git(root, ['commit', '-qm', 'commit verified execution'])
  fs.writeFileSync(path.join(root, 'src.js'), 'export const value = 3\n')
  assert.throws(assessNext, /已有写入会话/)
})

test('explicit abort audits the exact writer and preserves dirty scope without inventing completion', t => {
  const { root, context, bind } = fixture(t)
  const bound = bind()
  fs.writeFileSync(path.join(root, 'src.js'), 'export const value = 3\n')
  const snapshot = inspectExecutionWriter({ project: root })
  assert.equal(snapshot.writer?.executionId, bound.executionId)
  assert.equal(snapshot.writer?.verification, 'NOT_RUN')
  assert.ok(snapshot.writer?.scopeStatus.some(line => line.includes('src.js')))
  const request = { project: root, executionId: bound.executionId, ownerSessionId: context.sessionId,
    branch: snapshot.branch, expectedHead: snapshot.head, expectedScopeFingerprint: snapshot.writer!.scopeFingerprint, actor: 'operator',
    reason: 'Original session was lost; preserve its unfinished working files for review.' }
  assert.throws(() => abortExecution({ ...request, expectedHead: '0'.repeat(40) }), /已变化/)
  assert.equal(inspectExecutionWriter({ project: root }).writer?.executionId, bound.executionId)
  const result = abortExecution(request)
  assert.equal(result.release.status, 'ABORTED')
  assert.equal(inspectExecutionWriter({ project: root }).writer, null)
  assert.equal(fs.readFileSync(path.join(root, 'src.js'), 'utf8'), 'export const value = 3\n')
  const record = JSON.parse(fs.readFileSync(path.join(root, `.forge/spec-resolution/${bound.executionId}.json`), 'utf8'))
  assert.equal(record.release.reason, request.reason)
  assert.equal(record.verification, undefined)
})

test('an interrupted abort can finish releasing its writer without replacing its audit', t => {
  const { root, context, bind } = fixture(t)
  const bound = bind()
  const snapshot = inspectExecutionWriter({ project: root })
  const recordFile = path.join(root, `.forge/spec-resolution/${bound.executionId}.json`)
  const record = JSON.parse(fs.readFileSync(recordFile, 'utf8'))
  const reason = 'Original session was lost; retry the same interrupted abort operation.'
  record.release = { status: 'ABORTED', releasedAt: '2026-01-01T00:00:00.000Z', actor: 'operator',
    reason, head: snapshot.head, scopeStatus: [] }
  fs.writeFileSync(recordFile, JSON.stringify(record))
  const binding = fs.readdirSync(path.join(root, '.forge/spec-resolution')).find(name => name.startsWith('execution-session-'))!
  fs.unlinkSync(path.join(root, '.forge/spec-resolution', binding))
  const result = abortExecution({ project: root, executionId: bound.executionId, ownerSessionId: context.sessionId,
    branch: snapshot.branch, expectedHead: snapshot.head, expectedScopeFingerprint: snapshot.writer!.scopeFingerprint, actor: 'operator', reason })
  assert.equal(result.release.releasedAt, '2026-01-01T00:00:00.000Z')
  assert.equal(inspectExecutionWriter({ project: root }).writer, null)
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
