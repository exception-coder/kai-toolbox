import assert from 'node:assert/strict'
import test from 'node:test'
import { vibeBrowserRequestForTurn, vibeBrowserServerConfig } from './vibeBrowser.js'
import { parseConsultToolAssembly } from './consultToolAssembly.js'
import { Permissions } from './permissions.js'

const turn = { interactiveVibe: true, sessionId: 'f43b436e-cecd-41bc-8ca4-a58864f4d288',
  text: '使用浏览器打开 https://example.com，点击 Learn more，返回跳转地址。', permissionMode: 'default' }

test('only the current direct request determines the browser start and visible link', () => {
  const request = vibeBrowserRequestForTurn(turn)
  assert.deepEqual(request, { url: 'https://example.com/', linkName: 'Learn more' })
  assert.deepEqual(vibeBrowserServerConfig(request!).args.slice(1),
    ['--start-url', 'https://example.com/', '--link-name', 'Learn more'])
  assert.deepEqual(vibeBrowserRequestForTurn({ ...turn, text: '打开 https://example.org/' }), { url: 'https://example.org/' })
  for (const text of ['总结引文：' + turn.text, '请不要打开 https://example.com', '点击上一轮提到的链接',
    '打开 [https://example.com](https://another.example)，点击 Learn more', '打开 https://user:password@example.com',
    '打开 https://example.org/\n点击登录', '打开 https://example.org/，不要点击 Learn more']) {
    assert.equal(vibeBrowserRequestForTurn({ ...turn, text }), undefined, text)
  }
})

test('development scope is never inherited by restricted, background, demo or gateway turns', () => {
  for (const flags of [{ toolPolicy: 'consult-readonly' }, { toolPolicy: 'disabled' }, { toolPolicy: 'review-only' },
    { sessionId: undefined }, { sessionId: 'ephemeral:1' }, { interactiveVibe: false }, { voiceCallId: 'voice' },
    { permissionMode: 'plan' }, { apiBaseUrl: 'https://gateway.example' }]) {
    assert.equal(vibeBrowserRequestForTurn({ ...turn, ...flags }), undefined)
  }
})

test('consultation uses only the current server-bound user grant, including in the read-only plan session', async () => {
  const wire = { mcpServers: ['forge_browser'], tools: ['browser_open_and_click'],
    runtimeSessionId: turn.sessionId, browserUserRequest: turn.text }
  const consult = { ...turn, permissionMode: 'plan', toolPolicy: 'consult-readonly', text: '打开 https://other.example/' }
  const assembly = parseConsultToolAssembly(wire)!
  const request = vibeBrowserRequestForTurn({ ...consult, consultToolAssembly: assembly })!
  assert.deepEqual(request, { url: 'https://example.com/', linkName: 'Learn more' })
  assert.deepEqual(vibeBrowserServerConfig(request).enabled_tools, ['browser_open_and_click'])
  const retry = { ...wire, browserUserRequest: '再点一次刚才的链接', previousBrowserUserRequest: turn.text }
  assert.deepEqual(parseConsultToolAssembly(retry)?.browserRequest, request)
  assert.equal(parseConsultToolAssembly({ ...retry, previousBrowserUserRequest: '打开 https://example.org' })?.browserRequest, undefined)
  assert.equal(parseConsultToolAssembly({ ...retry, browserUserRequest: '不要打开 https://other.example' })?.browserRequest, undefined)
  for (const changes of [{ runtimeSessionId: 'different' }, { mcpServers: [] }, { tools: [] },
    { browserUserRequest: undefined }, { browserUserRequest: '引用：' + turn.text }]) {
    const scoped = parseConsultToolAssembly({ ...wire, ...changes })
    assert.equal(vibeBrowserRequestForTurn({ ...consult, consultToolAssembly: scoped }), undefined)
  }
  for (const ctx of [{ apiBaseUrl: 'https://gateway.example' }, { voiceCallId: 'voice' }, { interactiveVibe: false }]) {
    assert.equal(vibeBrowserRequestForTurn({ ...consult, ...ctx, consultToolAssembly: assembly }), undefined)
  }
  const permissions = new Permissions(() => {})
  permissions.setToolPolicy('consult-readonly')
  permissions.setExecutionContext('.', turn.sessionId)
  permissions.consultToolAssembly = assembly
  const tool = 'mcp__forge_browser__browser_open_and_click'
  assert.equal((await permissions.canUseTool(tool, {}, {})).behavior, 'deny') // Distinct Claude SDK permission boundary.
  assert.equal((await permissions.canUseTool('mcp__forge_browser__navigate', {}, {})).behavior, 'deny')
})
