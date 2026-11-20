import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CODEX_COMPUTER_USE_RECOVERY_STEER,
  computerUseFailureTitle,
  consultBrowserNotice,
  withConsultComputerUse,
} from './codexComputerUsePolicy.js'
import { buildCodexDeveloperInstructions } from './codexEngine.js'

test('consultation permits only official browser plugins over merged account/project policy', () => {
  const config = { features: { plugins: false, apps: false }, mcp_servers: { custom: { enabled: false } } }
  const effective = { plugins: { 'writer@example': { enabled: true }, 'project@example': { enabled: true } } }
  const result = withConsultComputerUse(config, effective)
  assert.deepEqual(result.features, { plugins: true, apps: false })
  assert.deepEqual(result.mcp_servers, config.mcp_servers)
  const plugins = result.plugins as Record<string, unknown>
  assert.deepEqual(plugins._default, { enabled: false })
  assert.deepEqual(plugins['writer@example'], { enabled: false })
  assert.deepEqual(plugins['project@example'], { enabled: false })
  assert.deepEqual(plugins['browser@openai-bundled'], { enabled: true })
  assert.deepEqual(plugins['unified-computer-use@openai-bundled'], {
    enabled: true, mcp_servers: { cua_repl: { enabled: true, enabled_tools: ['js', 'js_reset', 'turn_ended'] } },
  })
  assert.equal(config.features.plugins, false)
  assert.deepEqual(withConsultComputerUse(config, {}).plugins, {
    _default: { enabled: false },
    'browser@openai-bundled': { enabled: true }, 'chrome@openai-bundled': { enabled: true },
    'unified-computer-use@openai-bundled': plugins['unified-computer-use@openai-bundled'],
  })
})

test('consult browser notice distinguishes missing native tool from a failed inventory lookup', () => {
  const request = [{ type: 'text', text: '用浏览器点击筛选' }]
  assert.match(consultBrowserNotice(request, []) ?? '', /未提供用于点击的 cua_repl/)
  assert.match(consultBrowserNotice(request, undefined) ?? '', /目录.*未验证/)
  assert.equal(consultBrowserNotice(request, [{ name: 'cua_repl', tools: new Set(['js']) }]), undefined)
  assert.equal(consultBrowserNotice([{ type: 'text', text: '查找相关源码' }], []), undefined)
})

test('computer-use guidance forbids reusing stale accessibility nodes', () => {
  assert.match(CODEX_COMPUTER_USE_RECOVERY_STEER, /每次点击、输入、滚动或页面导航后.*getAXState/)
  assert.match(CODEX_COMPUTER_USE_RECOVERY_STEER, /禁止原样重复旧节点调用/)
  assert.match(CODEX_COMPUTER_USE_RECOVERY_STEER, /只重试该动作一次/)
})

test('injects computer-use recovery into development and authorized consultation sessions', () => {
  assert.match(buildCodexDeveloperInstructions('default') ?? '', /浏览器动态节点恢复/)
  assert.match(buildCodexDeveloperInstructions('consult-readonly') ?? '', /浏览器动态节点恢复/)
  assert.doesNotMatch(buildCodexDeveloperInstructions('review-only') ?? '', /浏览器动态节点恢复/)
  assert.doesNotMatch(buildCodexDeveloperInstructions('disabled') ?? '', /浏览器动态节点恢复/)
})

test('turns a detached cua node failure into an actionable activity title', () => {
  assert.equal(
    computerUseFailureTitle('cua_repl/js', '{"code":-32000,"message":"Node is detached from document"}'),
    'cua_repl/js · 页面节点已刷新，需重新定位后重试',
  )
  assert.equal(computerUseFailureTitle('graphify/query', 'Node is detached from document'), undefined)
  assert.equal(computerUseFailureTitle('cua_repl/js', 'permission denied'), undefined)
  assert.equal(computerUseFailureTitle('cua_repl/js', 'The browser access host is unavailable'),
    'cua_repl/js · 官方浏览器宿主未连接')
  assert.equal(computerUseFailureTitle('other/js', 'The browser access host is unavailable'), undefined)
})
