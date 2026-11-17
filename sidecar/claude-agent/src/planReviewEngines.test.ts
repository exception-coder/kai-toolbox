import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { harnessReviewOptions } from './engine/harnessReview.js'
import { hermesReviewEnvironment } from './hermesReview.js'
import { runHermesTurn } from './hermesEngine.js'
import { runZCodeReview } from './zcodeReview.js'
import { QWEN_REVIEW_BLOCKED_TOOLS } from './qwenReviewTools.js'

test('review homes omit native plugins and tool settings and preserve parent environment', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'review-env-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  writeFileSync(join(cwd, 'config.yaml'), 'model:\n  default: native-model\nplugins:\n  arbitrary: true\nmcp_servers:\n  dangerous: {}\n')
  writeFileSync(join(cwd, '.env'), 'DEEPSEEK_API_KEY=test-key\nHERMES_HOME=bad\nTOOLBOX_SECRET=private\n')
  const parent = { HERMES_HOME: cwd }
  const environment = hermesReviewEnvironment(cwd, parent)
  assert.equal(parent.HERMES_HOME, cwd)
  assert.equal(environment.DEEPSEEK_API_KEY, 'test-key')
  assert.equal(environment.TOOLBOX_SECRET, undefined)
  const config = readFileSync(join(environment.HERMES_HOME!, 'config.yaml'), 'utf8')
  assert.match(config, /native-model/)
  assert.match(config, /disabled_toolsets:/)
  assert.doesNotMatch(config, /arbitrary|dangerous|test-key/)
  const harness = harnessReviewOptions(cwd)
  assert.equal(harness.profile, 'sdk-minimal')
  const patches = JSON.parse(readFileSync(harness.patches![0], 'utf8'))
  assert.deepEqual(patches.map((entry: { id: string }) => entry.id), ['tool-fs', 'tool-working-directory', 'persistent-bash', 'persistent-pwsh', 'mcp-resources'])
  assert.ok(patches.every((entry: { disabled: boolean }) => entry.disabled === true))
})

test('pinned Qwen native built-in inventory remains fully blocked', () => {
  const root = join(process.cwd(), 'node_modules/@qwen-code/sdk/dist/cli/chunks')
  const definitions = readdirSync(root).filter(name => name.endsWith('.js'))
    .map(name => readFileSync(join(root, name), 'utf8')).find(text => /var ToolNames = \{/.test(text))
  assert.ok(definitions, 'native ToolNames definition changed; review the new SDK before enabling reviews')
  const block = definitions.match(/var ToolNames = \{([\s\S]*?)\n\};/)![1]
  const names = [...block.matchAll(/:\s*"([a-z_]+)"/g)].map(match => match[1])
  assert.ok(names.length > 30)
  for (const name of names) assert.ok(QWEN_REVIEW_BLOCKED_TOOLS.includes(name), `unblocked native tool: ${name}`)
})

test('Hermes disabled review rejects permission callbacks even when normal policy would allow', async () => {
  let permissions!: (params: Record<string, unknown>) => Promise<Record<string, unknown>>
  let nativeId = ''
  await runHermesTurn({ text: 'review', cwd: '.', permissionMode: 'default', toolPolicy: 'disabled',
    signal: new AbortController().signal, emit() {}, setSdkSessionId: id => { nativeId = id },
    canUseTool: async () => { assert.fail('must not ask or grant'); } }, (update, onPermission) => {
    permissions = onPermission
    return { close() {}, notify() {}, async request(method) {
      if (method === 'initialize') return { protocolVersion: 1, agentInfo: { name: 'hermes-agent' }, agentCapabilities: { loadSession: true } }
      if (method === 'session/new') return { sessionId: 'review', modes: { availableModes: [{ id: 'default' }] } }
      if (method === 'session/prompt') {
        assert.deepEqual(await permissions({ sessionId: nativeId, toolCall: { kind: 'execute' } }), { outcome: { outcome: 'cancelled' } })
        update({ sessionId: nativeId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'opinion' } } })
        return { stopReason: 'end_turn' }
      }
      return {}
    } }
  }, async () => async () => {})
})

test('ZCode review uses an empty native allowlist, handles host preferences and verifies final tool count', async () => {
  for (const toolCallCount of [0, 1]) {
    const calls: Array<Record<string, any>> = [], events: Array<Record<string, unknown>> = []
    const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
      kill() { queueMicrotask(() => child.emit('close', 0)); return true } })
    child.stdin.on('data', data => {
      const request = JSON.parse(String(data)); calls.push(request)
      if (!request.method) return
      if (request.method === 'session/create') queueMicrotask(() => child.stdout.write(JSON.stringify({ id: 'host-preferences', method: 'session/requestRuntimePreferences' }) + '\n'))
      const result = request.method === 'session/create' ? { session: { sessionId: 'fresh' }, runtime: { stateRevision: 1 } }
        : request.method === 'session/events' ? { events: [{ sessionId: 'fresh', seq: 1, type: 'turn.completed',
          payload: { resultType: 'success', toolCallCount, response: 'final opinion' } }] } : {}
      queueMicrotask(() => child.stdout.write(JSON.stringify({ id: request.id, result }) + '\n'))
    })
    const run = runZCodeReview({ text: 'material', cwd: '.', permissionMode: 'default', toolPolicy: 'disabled',
      signal: new AbortController().signal, emit: event => events.push(event), setSdkSessionId() {} }, (() => child) as never)
    if (toolCallCount) await assert.rejects(run, /未成功/)
    else { await run; assert.equal(events.at(-1)?.stopReason, 'end_turn'); assert.equal(events[0].text, 'final opinion') }
    assert.deepEqual(calls[0].params.toolAllowlist, [])
    assert.deepEqual(calls[0].params.mcpServers, [])
    assert.equal(calls[0].params.dynamicWorkflowEnabled, false)
    assert.equal(calls.find(call => call.id === 'host-preferences')?.result.memoryEnabled, false)
  }
})
