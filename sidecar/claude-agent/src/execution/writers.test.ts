import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { executionScopes, readWriters, writeWriters, releaseWriter, scopesConflict } from './writers.js'
import { hash, saveJson, statePath } from '../specResolution/storage.js'
import { git } from './repository.js'
import { discoverExecution } from './context.js'
import { assessExecution } from './service.js'
import { checkExecutionEvent } from './lifecycle.js'

function fixture(t: test.TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'writer-scopes-')))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const dir of ['iam', 'srm', 'sidecar/claude-agent']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true })
    fs.writeFileSync(path.join(root, dir, 'package.json'), '{}')
  }
  return root
}

test('governance and ordinary unowned files never claim unrelated modules', t => {
  const root = fixture(t)
  const scopes = executionScopes(root, ['iam/src/main.ts', '.team-standards/design-baselines.json',
    'scripts/check.ps1', 'README.md', '.github/workflows/test.yml', 'docs/ai-coding-architecture.md'])
  assert.equal(scopes.includes('*'), false)
  assert.equal(scopesConflict(scopes, executionScopes(root, ['srm/src/main.ts'])), false)
  assert.equal(scopesConflict(scopes, executionScopes(root, ['.team-standards/design-baselines.json'])), true)
  assert.equal(scopesConflict(scopes, executionScopes(root, ['pom.xml'])), true)
  assert.equal(scopesConflict(scopes, executionScopes(root, ['db/migration/V096.sql'])), true)
})

test('Sidecar source files are independent while module builds remain exclusive', t => {
  const root = fixture(t)
  const first = executionScopes(root, ['sidecar/claude-agent/src/execution/service.ts'])
  for (const file of ['sidecar/claude-agent/src/execution/writers.ts', 'sidecar/claude-agent/src/sessionManager.ts']) {
    assert.equal(scopesConflict(first, executionScopes(root, [file])), false)
  }
  assert.equal(scopesConflict(first, first), true)
  assert.equal(scopesConflict(first, executionScopes(root, ['sidecar/claude-agent/package.json'])), true)
  assert.equal(scopesConflict(first, ['module:sidecar/claude-agent/src/execution']), true)
})

function record(root: string, id: string, sessionId: string, files: string[]) {
  saveJson(statePath(root, id), { schemaVersion: 1, executionId: id, project: root, sessionId,
    discovery: { project: root, sessionId, files }, assessment: { project: root, sessionId, designFiles: [] },
    verification: { fingerprint: 'preserved', results: [] } })
  return { executionId: id, sessionId, scopes: ['*'] }
}
const one = `ex_${'1'.repeat(32)}`
const two = `ex_${'2'.repeat(32)}`

test('existing broad writers are projected before checking conflicts without changing any record', t => {
  const root = fixture(t)
  const writers = [record(root, one, 'one', ['iam/a.ts', '.team-standards/design-baselines.json']),
    record(root, two, 'two', ['srm/b.ts'])]
  saveJson(statePath(root, 'execution-writers'), writers)
  const before = fs.readFileSync(statePath(root, one), 'utf8')
  const projected = readWriters(root)
  assert.equal(projected.length, 2)
  assert.equal(projected.some(w => w.scopes.includes('*')), false)
  assert.equal(fs.readFileSync(statePath(root, one), 'utf8'), before)
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath(root, 'execution-writers'), 'utf8')), writers)
})

test('legacy writer coexists with a new writer and releases independently', t => {
  const root = fixture(t)
  const old = record(root, one, 'one', ['iam/a.ts'])
  saveJson(statePath(root, 'execution-writer'), { executionId: one, sessionId: 'one' })
  const next = record(root, two, 'two', ['srm/a.ts'])
  writeWriters(root, [...readWriters(root), next])
  assert.equal(readWriters(root).length, 2)
  releaseWriter(root, next)
  assert.equal(readWriters(root)[0].executionId, old.executionId)
  writeWriters(root, [...readWriters(root), next])
  releaseWriter(root, old)
  assert.deepEqual(readWriters(root).map(w => w.executionId), [two])
  assert.equal(fs.existsSync(statePath(root, one)), true)
})

test('missing records, inconsistent identities and overlapping projections fail closed', t => {
  const root = fixture(t)
  const first = record(root, one, 'one', ['iam/a.ts'])
  saveJson(statePath(root, 'execution-writers'), [first])
  for (const field of ['project', 'sessionId', 'executionId']) {
    const filename = statePath(root, one)
    const original = JSON.parse(fs.readFileSync(filename, 'utf8'))
    saveJson(filename, { ...original, [field]: 'wrong' })
    assert.throws(() => readWriters(root), /身份不匹配/)
    saveJson(filename, original)
  }
  saveJson(statePath(root, `execution-session-${hash('one')}`), { executionId: two })
  assert.throws(() => readWriters(root), /会话绑定/)
  fs.unlinkSync(statePath(root, `execution-session-${hash('one')}`))
  saveJson(statePath(root, 'execution-writers'), [first, record(root, two, 'two', ['iam/b.ts'])])
  assert.throws(() => readWriters(root), /冲突范围/)
  fs.unlinkSync(statePath(root, one))
  assert.throws(() => readWriters(root), /缺少原执行记录/)
})

test('reprojecting ownership does not authorize V096 outside the original exact file list', t => {
  const root = fixture(t)
  git(root, ['init', '-q', '-b', 'main'])
  git(root, ['config', 'user.name', 'Fixture'])
  git(root, ['config', 'user.email', 'fixture@example.invalid'])
  fs.writeFileSync(path.join(root, 'README.md'), 'Preserve the existing implementation contract.\n')
  git(root, ['add', 'README.md'])
  git(root, ['commit', '-qm', 'baseline'])
  const context = { project: root, sessionId: 'one' }
  const execution = assessExecution({ ...context,
    discoveryId: discoverExecution({ ...context, request: 'Preserve implementation', files: ['iam/a.ts'] }).discoveryId,
    actor: 'fixture', behavior: 'preserved', design: 'none', impacts: ['logic'],
    reason: 'Preserve existing behavior with a scoped implementation fix.',
    evidence: [{ path: 'README.md', quote: 'Preserve the existing implementation contract.' }] })
  saveJson(statePath(root, 'execution-writers'), [{ executionId: execution.executionId, sessionId: 'one', scopes: ['*'] }])
  assert.deepEqual(readWriters(root)[0].scopes, ['module:iam'])
  assert.equal(checkExecutionEvent({ ...context, event: 'WRITE', files: ['iam/a.ts'] }).allowed, true)
  const denied = checkExecutionEvent({ ...context, event: 'WRITE', files: ['iam/db/migration/V096.sql'] })
  assert.equal(denied.allowed, false)
  assert.equal(denied.code, 'IMPLEMENTATION_SCOPE_DRIFT')
})
