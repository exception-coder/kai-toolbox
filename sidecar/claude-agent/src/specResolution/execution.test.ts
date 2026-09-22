import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { assessExecution, checkExecution, discoverExecution, finishExecution, git, isBranchMutation } from './execution.js'
import { runExecutionVerification } from './executionVerification.js'
import { Permissions } from '../permissions.js'

function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge execution '))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  git(root, ['init', '-q', '-b', 'main'])
  git(root, ['config', 'user.name', 'Fixture']); git(root, ['config', 'user.email', 'fixture@example.invalid'])
  const write = (file: string, text: string) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text) }
  write('src.js', 'export const answer = 41\n')
  write('README.md', 'The answer should equal forty two.\n')
  write('.gitignore', '.forge/\n')
  write('test.cjs', "const assert = require('node:assert/strict'); const fs=require('node:fs'); assert.match(fs.readFileSync('src.js','utf8'), /answer = 42/);\n")
  git(root, ['add', 'src.js', 'README.md', 'test.cjs', '.gitignore']); git(root, ['commit', '-qm', 'baseline'])
  const context = { project: root, sessionId: 'session-a' }
  const discover = () => discoverExecution({ ...context, request: 'Restore existing answer behavior', files: ['src.js', 'test.cjs'] })
  const assess = (extra: Record<string, unknown> = {}) => assessExecution({ ...context, discoveryId: discover().discoveryId,
    actor: 'test Agent', behavior: 'preserved', design: 'none', impacts: ['logic'],
    reason: 'Restore the documented answer without changing the public contract.', evidence: [{ path: 'README.md', quote: 'The answer should equal forty two.' }], ...extra })
  const verify = (extra: Record<string, unknown> = {}) => runExecutionVerification({ ...context, inputFiles: ['test.cjs'],
    checks: [{ kind: 'regression', program: process.execPath, args: ['test.cjs'], purpose: 'Assert corrected value equals documented behavior' }], ...extra })
  return { root, write, context, discover, assess, verify }
}

test('no OpenSpec project: inspect, assess, actual regression, commit, finish without creating specs', async t => {
  const { root, write, context, assess, verify } = fixture(t)
  assert.equal(assess().policy.spec, 'NO_SPEC_CHANGE')
  assert.equal(checkExecution({ ...context, files: ['src.js'] }).allowed, true)
  assert.throws(() => checkExecution({ ...context, operation: 'BEFORE_COMMIT' }), /执行对应验证/)
  assert.equal((await verify()).allowed, false)
  write('src.js', 'export const answer = 42\n')
  assert.equal((await verify()).allowed, true)
  git(root, ['add', 'src.js'])
  assert.equal(checkExecution({ ...context, operation: 'BEFORE_COMMIT' }).allowed, true)
  git(root, ['commit', '-qm', 'fix answer'])
  assert.equal(finishExecution(context).allowed, true)
  assert.equal(fs.existsSync(path.join(root, 'openspec')), false)
})

test('OpenSpec enabled bug fix does not require an empty change; behavior change does', t => {
  const { write, assess, context } = fixture(t)
  write('openspec/config.yaml', 'schema: spec-driven\n')
  write('openspec/specs/sample/spec.md', '### Requirement: answer\nSystem SHALL return 42.\n#### Scenario: query\nReturn 42.\n')
  assert.equal(assess().policy.spec, 'NO_SPEC_CHANGE')
  assert.throws(() => assess({ behavior: 'changed' }), /行为发生变化/)
  assert.throws(() => assess({ behavior: 'unknown' }), /行为影响尚未确定/)
  write('openspec/specs/sample/spec.md', '### Requirement: answer\nSystem SHALL return 43.\n')
  assert.throws(() => checkExecution(context), /正式规格变化/)
})

test('quotes, discovery revision and scope are enforced', t => {
  const { write, assess, context, discover } = fixture(t)
  assert.throws(() => assess({ evidence: [{ path: 'README.md', quote: 'This was never agreed to.' }] }), /引用不在原文/)
  const discovery = discover()
  write('src.js', 'export const answer = 40\n')
  assert.throws(() => assess({ discoveryId: discovery.discoveryId }), /探索后相关内容变化/)
  assess()
  assert.throws(() => checkExecution({ ...context, files: ['other.js'] }), /超出执行范围/)
  assert.throws(() => checkExecution({ ...context, files: ['../escape.js'] }), /路径/)
})
test('discovery reports the exact directory or oversized evidence path', t => {
  const { root, write, context } = fixture(t)
  fs.mkdirSync(path.join(root, 'src-dir'))
  assert.throws(() => discoverExecution({ ...context, request: 'Inspect exact evidence', files: ['src-dir'] }),
    /src-dir.*不传目录/)
  write('large.txt', 'x'.repeat(4 * 1024 * 1024 + 1))
  assert.throws(() => discoverExecution({ ...context, request: 'Inspect exact evidence', files: ['large.txt'] }),
    /large\.txt.*4\.00 MiB/)
})

test('shared workspace rejects a second writer and branch changes even with host auto approval', async t => {
  const { root, assess, context } = fixture(t)
  assess()
  const second = discoverExecution({ ...context, sessionId: 'session-b', request: 'Fix another answer', files: ['src.js'] })
  assert.throws(() => assess({ sessionId: 'session-b', discoveryId: second.discoveryId }), /已有写入会话/)
  const permissions = new Permissions(() => assert.fail('branch policy should not ask for generic auto approval'))
  permissions.setExecutionContext(root, context.sessionId); permissions.setMode('bypassPermissions'); permissions.setAutoApprove(true)
  const denied = await permissions.canUseTool('Bash', { command: 'git switch -c task-2' }, {})
  assert.equal(denied.behavior, 'deny')
  permissions.setExecutionContext(root, 'unbound-session')
  assert.equal((await permissions.canUseTool('Write', { file_path: path.join(root, 'src.js') }, {})).behavior, 'deny')
  git(root, ['switch', '-qc', 'external'])
  assert.throws(() => checkExecution(context), /分支偏离/)
})

test('staged scope and content hashes invalidate stale verification even when status is unchanged', async t => {
  const { root, write, assess, context, verify } = fixture(t)
  assess(); write('src.js', 'export const answer = 42\n'); await verify()
  write('src.js', 'export const answer = 43\n')
  assert.throws(() => checkExecution({ ...context, operation: 'BEFORE_COMMIT' }), /相关输入变更/)
  write('src.js', 'export const answer = 42\n'); write('other.js', 'unrelated')
  git(root, ['add', 'other.js'])
  assert.throws(() => checkExecution({ ...context, operation: 'BEFORE_COMMIT' }), /超出执行范围/)
})

test('successful workspace checks cannot approve a different staged snapshot', async t => {
  const { root, write, assess, context, verify } = fixture(t)
  assess(); write('src.js', 'export const answer = 43\n'); git(root, ['add', 'src.js'])
  write('src.js', 'export const answer = 42\n'); assert.equal((await verify()).allowed, true)
  assert.throws(() => checkExecution({ ...context, operation: 'BEFORE_COMMIT' }), /待提交内容与测试工作区不一致/)
})

test('verification tool cannot be used to request a direct branch operation', async t => {
  const { root, assess, verify } = fixture(t); assess()
  await assert.rejects(verify({ checks: [{ kind: 'regression', program: 'git', args: ['switch', '-c', 'task-2'], purpose: 'Should not be a verification operation' }] }), /验证入口也不能/)
  assert.equal(git(root, ['branch', '--show-current']), 'main')
})

test('risk adds verification independently of spec and design; missing verifiers never pass', async t => {
  const { write, assess, verify } = fixture(t)
  const result = assess({ impacts: ['permission', 'migration', 'ui'] })
  assert.equal(result.policy.spec, 'NO_SPEC_CHANGE'); assert.equal(result.policy.design, 'none')
  assert.deepEqual(result.policy.verification, ['regression', 'api', 'sql', 'ui'])
  write('src.js', 'export const answer = 42\n')
  const report = await verify()
  assert.equal(report.allowed, false); assert.deepEqual(report.missing, ['api', 'sql', 'ui'])
})

test('architecture-only work requires affected designs without inventing business delta', async t => {
  const { write, assess, context, verify } = fixture(t)
  assert.throws(() => assess({ design: 'architecture' }), /详设/)
  const result = assess({ design: 'architecture', designFiles: [{ path: 'docs/overview.md', level: 'overview' }, { path: 'docs/detail.md', level: 'detail' }] })
  assert.equal(result.policy.spec, 'NO_SPEC_CHANGE')
  write('src.js', 'export const answer = 42\n'); await verify()
  assert.throws(() => checkExecution({ ...context, operation: 'BEFORE_COMMIT' }), /更新受影响设计/)
})

test('branch guard covers direct command variants and permits explicit read-only branch listing', () => {
  for (const command of ['git checkout -b x', 'git switch -c x', 'git -C "a b" worktree add ../x', 'git branch task', 'git branch --list -D task', 'git.exe -c x=y switch main', 'git update-ref refs/heads/task HEAD']) assert.equal(isBranchMutation(command), true, command)
  for (const command of ['git branch --show-current', 'git branch --list', 'git status', 'git diff']) assert.equal(isBranchMutation(command), false, command)
})

test('timeout and concurrent input changes do not produce valid evidence', async t => {
  const { write, assess, verify } = fixture(t)
  assess(); write('src.js', 'export const answer = 42\n')
  const result = await verify({ timeoutMs: 100, checks: [{ kind: 'regression', program: process.execPath, args: ['-e', 'setTimeout(()=>{},1000)'], purpose: 'Exercise bounded timeout failure' }] })
  assert.equal(result.allowed, false)
  await assert.rejects(verify({ checks: [{ kind: 'regression', program: process.execPath, args: ['-e', "require('fs').writeFileSync('src.js', 'changed')"], purpose: 'Exercise changes during verification' }] }), /验证期间/)
})
