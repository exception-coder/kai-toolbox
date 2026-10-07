import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { git } from './repository.js'
import { discoverExecution } from './context.js'
import { assessExecution } from './service.js'
import { runExecutionVerification } from './verification.js'

function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-verification-reuse-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  git(root, ['init', '-q', '-b', 'main'])
  git(root, ['config', 'user.name', 'Fixture'])
  git(root, ['config', 'user.email', 'fixture@example.invalid'])
  fs.writeFileSync(path.join(root, 'src.js'), 'one')
  fs.writeFileSync(path.join(root, 'README.md'), 'Preserve the existing contract.')
  fs.writeFileSync(path.join(root, 'check.cjs'), "const fs=require('node:fs');fs.appendFileSync('runs.log','x');process.exit(fs.readFileSync('src.js','utf8')==='fail'?1:0)")
  git(root, ['add', 'src.js', 'README.md', 'check.cjs'])
  git(root, ['commit', '-qm', 'baseline'])
  const context = { project: root, sessionId: 'verification-reuse' }
  assessExecution({ ...context,
    discoveryId: discoverExecution({ ...context, request: 'Preserve the existing contract', files: ['src.js'] }).discoveryId,
    actor: 'fixture', behavior: 'preserved', design: 'none', impacts: ['logic'],
    reason: 'Preserve the documented behavior while improving verification scheduling.',
    evidence: [{ path: 'README.md', quote: 'Preserve the existing contract.' }] })
  const verify = (force = false, kind = 'regression') => runExecutionVerification({ ...context, force,
    inputFiles: ['check.cjs'], checks: [{ kind, program: process.execPath, args: ['check.cjs'], purpose: 'Check current source' }] })
  const count = () => fs.readFileSync(path.join(root, 'runs.log'), 'utf8').length
  return { root, verify, count }
}

test('same local evidence is reused; force, source and test changes rerun it', async t => {
  const { root, verify, count } = fixture(t)
  assert.equal((await verify()).allowed, true)
  const cached = await verify()
  assert.equal(cached.allowed, true)
  assert.equal(cached.reusedCheckIds.length, 1)
  assert.deepEqual(cached.executedCheckIds, [])
  assert.equal(count(), 1)
  assert.equal((await verify(true)).executedCheckIds.length, 1)
  fs.writeFileSync(path.join(root, 'src.js'), 'two')
  assert.equal((await verify()).executedCheckIds.length, 1)
  fs.appendFileSync(path.join(root, 'check.cjs'), '\n// changed test dependency\n')
  assert.equal((await verify()).executedCheckIds.length, 1)
  assert.equal(count(), 4)
})

test('failures never become cached passes and repair reruns the check', async t => {
  const { root, verify, count } = fixture(t)
  fs.writeFileSync(path.join(root, 'src.js'), 'fail')
  assert.equal((await verify()).allowed, false)
  assert.equal((await verify()).allowed, false)
  assert.equal(count(), 2)
  fs.writeFileSync(path.join(root, 'src.js'), 'fixed')
  assert.equal((await verify()).allowed, true)
  assert.equal(count(), 3)
})

test('external checks always execute despite unchanged source inputs', async t => {
  const { verify, count } = fixture(t)
  for (const kind of ['api', 'sql', 'ui']) {
    await verify(false, kind)
    const repeated = await verify(false, kind)
    assert.deepEqual(repeated.reusedCheckIds, [])
    assert.equal(repeated.executedCheckIds.length, 1)
  }
  assert.equal(count(), 6)
})
