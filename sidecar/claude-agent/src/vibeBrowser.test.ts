import assert from 'node:assert/strict'
import test from 'node:test'
import { vibeBrowserRequestForTurn, vibeBrowserServerConfig } from './vibeBrowser.js'

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

test('only ordinary interactive Codex development turns use the browser worker', () => {
  for (const flags of [{ toolPolicy: 'consult-readonly' }, { toolPolicy: 'disabled' }, { toolPolicy: 'review-only' },
    { sessionId: undefined }, { sessionId: 'ephemeral:1' }, { interactiveVibe: false }, { voiceCallId: 'voice' },
    { permissionMode: 'plan' }, { apiBaseUrl: 'https://gateway.example' }]) {
    assert.equal(vibeBrowserRequestForTurn({ ...turn, ...flags }), undefined)
  }
})
