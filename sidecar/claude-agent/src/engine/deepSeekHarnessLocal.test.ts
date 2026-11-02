import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { bindHarnessSession, harnessEnvironment } from './deepSeekHarnessLocal.js'

test('reads only the versioned native DeepSeek key, scrubs other secrets and respects explicit environment', () => {
  const home = mkdtempSync(join(tmpdir(), 'forge-dsh-credential-'))
  const file = join(home, 'credentials.yaml')
  writeFileSync(file, 'version: 1\nrefs:\n  DEEPSEEK_API_KEY: native-test-key\n')
  const env = harnessEnvironment({ PATH: 'runtime-path', ANTHROPIC_AUTH_TOKEN: 'unrelated', TOOLBOX_API_TOKEN: 'forge-token', DSH_PERMISSION_MODE: 'danger-full-access' }, file)
  assert.equal(env.DEEPSEEK_API_KEY, 'native-test-key')
  assert.equal(env.PATH, 'runtime-path')
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, undefined)
  assert.equal(env.TOOLBOX_API_TOKEN, undefined)
  assert.equal(env.DSH_PERMISSION_MODE, 'workspace-write')
  assert.equal(harnessEnvironment({ DEEPSEEK_API_KEY: 'explicit-test-key' }, file).DEEPSEEK_API_KEY, 'explicit-test-key')
  writeFileSync(file, 'version: 99\nrefs:\n  DEEPSEEK_API_KEY: incompatible-test-key\n')
  assert.throws(() => harnessEnvironment({}, file), /未找到 DeepSeek Key/)
})

test('malformed credential errors never include credential document values', () => {
  const home = mkdtempSync(join(tmpdir(), 'forge-dsh-credential-'))
  const file = join(home, 'credentials.yaml')
  writeFileSync(file, 'version: 1\nrefs: [SENSITIVE_TEST_VALUE\n')
  assert.throws(() => harnessEnvironment({}, file), error => error instanceof Error && !error.message.includes('SENSITIVE_TEST_VALUE'))
})

test('the backend-owned credential is removed from ambient environment before other engine children start', () => {
  const moduleUrl = new URL('./deepSeekHarnessLocal.js', import.meta.url).href
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    `const m=await import(${JSON.stringify(moduleUrl)});console.log(JSON.stringify({ambient:process.env.KAI_DEEPSEEK_HARNESS_API_KEY,harness:m.harnessEnvironment(process.env).DEEPSEEK_API_KEY}));`],
  { encoding: 'utf8', windowsHide: true, env: { ...process.env, DEEPSEEK_API_KEY: '', KAI_DEEPSEEK_HARNESS_API_KEY: 'managed-test-key' } })
  assert.equal(result.status, 0)
  assert.deepEqual(JSON.parse(result.stdout), { harness: 'managed-test-key' })
})

test('binding resumes the same native identity and refuses another workspace before native restoration', async () => {
  const home = mkdtempSync(join(tmpdir(), 'forge-dsh-binding-'))
  const cwd = join(home, 'project-a'), other = join(home, 'project-b')
  mkdirSync(cwd); mkdirSync(other)
  const resumed: string[] = []
  const client = { resumeSession: async (id: string) => { resumed.push(id) }, getWorkingDirectory: async () => cwd }
  await bindHarnessSession(client, home, 'session-a', cwd)
  assert.deepEqual(resumed, [])
  await bindHarnessSession(client, home, 'session-a', cwd)
  assert.deepEqual(resumed, ['session-a'])
  await assert.rejects(bindHarnessSession(client, home, 'session-a', other), /跨项目/)
  assert.deepEqual(resumed, ['session-a'])
  await assert.rejects(bindHarnessSession({ ...client, resumeSession: async () => { throw new Error('missing native history') } }, home, 'session-a', cwd), /missing native history/)
})

test('a runtime directory mismatch leaves no usable binding and does not send a prompt', async () => {
  const home = mkdtempSync(join(tmpdir(), 'forge-dsh-binding-'))
  const cwd = join(home, 'project-a'), wrong = join(home, 'project-b')
  mkdirSync(cwd); mkdirSync(wrong)
  let resumed = 0
  const client = { resumeSession: async () => { resumed++ }, getWorkingDirectory: async () => wrong }
  await assert.rejects(bindHarnessSession(client, home, 'session-a', cwd), /实际工作目录/)
  await assert.rejects(bindHarnessSession(client, home, 'session-a', cwd), /实际工作目录/)
  assert.equal(resumed, 0)
})
