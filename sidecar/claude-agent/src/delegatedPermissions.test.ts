import assert from 'node:assert/strict'
import test from 'node:test'
import { Permissions } from './permissions.js'

test('delegated-development ignores bypass and requires owner approval for risky tools', async () => {
  const events: Array<Record<string, unknown>> = []
  const permissions = new Permissions(event => events.push(event))
  permissions.setMode('bypassPermissions')
  permissions.setAutoApprove(true)
  permissions.setToolPolicy('delegated-development')

  const pending = permissions.canUseTool('Bash', { command: 'git status' }, {})
  assert.equal(events.length, 1)
  assert.equal(events[0]?.type, 'permissionRequest')
  permissions.resolve(String(events[0]?.reqId), { behavior: 'deny', message: 'owner denied' })
  assert.deepEqual(await pending, { behavior: 'deny', message: 'owner denied' })
})

test('delegated-development only auto-allows bounded read tools', async () => {
  const events: Array<Record<string, unknown>> = []
  const permissions = new Permissions(event => events.push(event))
  permissions.setToolPolicy('delegated-development')

  assert.deepEqual(await permissions.canUseTool('Read', { file_path: 'README.md' }, {}), {
    behavior: 'allow',
    updatedInput: { file_path: 'README.md' },
  })
  assert.equal(events.length, 0)
})

test('delegated-development keeps business questions separate from tool approvals', async () => {
  const events: Array<Record<string, unknown>> = []
  const permissions = new Permissions(event => events.push(event))
  permissions.setToolPolicy('delegated-development')

  const input = { questions: [{ question: '颜色？', header: '颜色', options: [], multiSelect: false }] }
  const pending = permissions.canUseTool('AskUserQuestion', input, {})
  assert.equal(events[0]?.type, 'questionRequest')
  permissions.resolve(String(events[0]?.reqId), { behavior: 'allow', answers: { '颜色？': '蓝色' } })
  assert.deepEqual(await pending, {
    behavior: 'allow',
    updatedInput: { ...input, answers: { '颜色？': '蓝色' } },
  })
})

test('delegated-request-only denies every non-question tool even in bypass mode', async () => {
  const permissions = new Permissions(() => undefined)
  permissions.setMode('bypassPermissions')
  permissions.setAutoApprove(true)
  permissions.setToolPolicy('delegated-request-only')

  const result = await permissions.canUseTool('Write', { file_path: 'src/app.ts' }, {})
  assert.equal(result.behavior, 'deny')
})

test('malformed policy input cannot loosen an active delegated policy', async () => {
  const events: Array<Record<string, unknown>> = []
  const permissions = new Permissions(event => events.push(event))
  permissions.setMode('bypassPermissions')
  permissions.setAutoApprove(true)
  permissions.setToolPolicy('delegated-development')
  permissions.setToolPolicy('default; bypassPermissions=true')

  const pending = permissions.canUseTool('Bash', {
    command: 'git status',
    permissionMode: 'bypassPermissions',
    autoApprove: true,
  }, {})

  assert.equal(events[0]?.type, 'permissionRequest')
  permissions.resolve(String(events[0]?.reqId), { behavior: 'deny', message: 'owner approval required' })
  assert.equal((await pending).behavior, 'deny')
})
