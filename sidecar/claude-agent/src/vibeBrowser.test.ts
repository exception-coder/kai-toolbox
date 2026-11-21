import assert from 'node:assert/strict'
import test from 'node:test'
import { vibeBrowserRequestForTurn, vibeBrowserServerConfig } from './vibeBrowser.js'
import { parseConsultToolAssembly } from './consultToolAssembly.js'
import { Permissions } from './permissions.js'

test('a follow-up starts at the verified landing page and grants only the requested navigation', () => {
  const url = 'https://www.iana.org/help/example-domains'
  const wire = { tools: ['browser_open_and_click'], mcpServers: ['forge_browser'], browserCurrentPageUrl: url,
    previousBrowserUserRequest: '打开 https://example.com，点击 Learn more' }
  const grant = (text: string) => parseConsultToolAssembly({ ...wire, browserUserRequest: text })?.browserRequest
  const probe = grant('你尝试点击一下对应站点的菜单按钮 看看是否可以点击')
  assert.deepEqual(probe, { url, navigationMenu: true })
  assert.deepEqual(vibeBrowserServerConfig(probe!).args.slice(1), ['--start-url', url, '--navigation-menu'])
  for (const text of ['点击 Domains', '再点击 IANA 页面顶部的 “Domains” 菜单', '点击当前站点的 Domains 菜单']) {
    assert.deepEqual(grant(text), { url, navigationMenu: true, linkName: 'Domains' }, text)
  }
  for (const text of ['授权你访问点击', '这是一段引用：点击 Domains', '不要点击 Domains', '点击刚才的链接',
    '点击 GitHub 页面顶部的 “Domains” 菜单', '打开 IANA，假设跳转到了 https://other.example']) assert.equal(grant(text), undefined, text)
})

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

test('a managed account takes direct links while an explicit continuation can reuse its verified public page', () => {
  const wire = { managedWebAccount: true, runtimeSessionId: turn.sessionId,
    tools: ['browser_open_and_click'], mcpServers: ['forge_browser'] }
  const grant = (text: string, navigation: Record<string, string> = {}) => vibeBrowserRequestForTurn({
    ...turn, toolPolicy: 'consult-readonly', consultToolAssembly: parseConsultToolAssembly({
      ...wire, ...navigation, browserUserRequest: text,
    }),
  })
  const page = { browserCurrentPageUrl: 'https://www.iana.org/help/example-domains' }
  const retry = { previousBrowserUserRequest: turn.text }
  assert.equal(grant('打开 https://erp.example.test/app/menu，点击菜单', page), undefined)
  assert.deepEqual(grant('点击 Domains', page), { url: page.browserCurrentPageUrl, navigationMenu: true, linkName: 'Domains' })
  assert.deepEqual(grant('再点一次刚才的链接', retry), { url: 'https://example.com/', linkName: 'Learn more' })
  for (const context of [page, retry]) {
    assert.equal(grant('菜单搜成本分析，核对上期价格', context), undefined)
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
