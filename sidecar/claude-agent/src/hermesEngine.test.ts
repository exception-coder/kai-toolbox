import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { HermesAcpClient, runHermesTurn, initializeHermes, probeHermesRuntime, acquireHermesTurn, type HermesTurnContext, type HermesClient } from './hermesEngine.js'

type Json = Record<string, unknown>
const initialized = { protocolVersion: 1, agentInfo: { name: 'hermes-agent', version: 'test' }, agentCapabilities: { loadSession: true } }
const session = { sessionId: 'native', modes: { availableModes: [{ id: 'default' }, { id: 'accept_edits' }] } }
function context() {
  const events: Json[] = [], ids: string[] = [], controller = new AbortController()
  const ctx: HermesTurnContext = { text: 'inspect project', cwd: '.', permissionMode: 'default', signal: controller.signal,
    emit: event => events.push(event), setSdkSessionId: id => ids.push(id) }
  return { ctx, events, ids, controller }
}
function fake(behavior?: (method: string, params: Json, update: (params: Json) => void) => Promise<Json>) {
  const calls: Array<{ method: string; params: Json }> = []
  let permission: (params: Json) => Promise<Json> = async () => ({})
  let update: (params: Json) => void = () => undefined
  const client: HermesClient = {
    async request(method, params) {
      calls.push({ method, params })
      if (method === 'initialize') return initialized
      if (behavior) return behavior(method, params, update)
      if (method === 'session/new' || method === 'session/load') return session
      if (method === 'session/prompt') {
        update({ sessionId: 'native', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'done' } } })
        return { stopReason: 'end_turn', usage: { inputTokens: 900 } }
      }
      return {}
    },
    notify(method, params) { calls.push({ method, params }) }, close() {},
  }
  return { calls, client, permission: (params: Json) => permission(params),
    factory: (onUpdate: typeof update, onPermission: typeof permission) => { update = onUpdate; permission = onPermission; return client } }
}

test('ACP probe only initializes; rejects wrong agent identity or missing exact load support', async () => {
  const f = fake()
  assert.equal((await probeHermesRuntime(() => f.client)).status, 'ready')
  assert.deepEqual(f.calls.map(call => call.method), ['initialize'])
  await assert.rejects(initializeHermes({ request: async () => ({ ...initialized, agentInfo: { name: 'another-agent' } }) }), /不兼容/)
  await assert.rejects(initializeHermes({ request: async () => ({ ...initialized, agentCapabilities: {} }) }), /不兼容/)
})

test('streaming uses exact native identity and never bills cumulative session usage as turn usage', async () => {
  const c = context(), f = fake()
  let released = false
  await runHermesTurn(c.ctx, f.factory, async () => async () => { released = true })
  assert.deepEqual(c.ids, ['native'])
  assert.ok(c.events.some(event => event.type === 'assistantDelta' && event.text === 'done'))
  assert.deepEqual(c.events.at(-1), { type: 'result', usage: {}, stopReason: 'end_turn' })
  assert.equal(released, true)
  assert.equal(f.calls.find(call => call.method === 'session/set_mode')?.params.modeId, 'default')
})

test('restricted policies, unsupported model/mode and pre-cancelled turn never launch', async () => {
  for (const override of [{ toolPolicy: 'consult-readonly' }, { toolPolicy: 'review-only' },
    { model: 'inherited-codex-model' }, { images: [{ mediaType: 'image/png', data: 'x' }] }, { permissionMode: 'bypassPermissions' }, { permissionMode: 'plan' }]) {
    const c = context()
    await runHermesTurn({ ...c.ctx, ...override }, () => { assert.fail('must not launch') })
    assert.equal(c.events.at(-1)?.stopReason, 'error')
  }
  const c = context(); c.controller.abort()
  await runHermesTurn(c.ctx, () => { assert.fail('must not launch') })
  assert.equal(c.events.at(-1)?.stopReason, 'interrupted')
})

test('history replay is ignored and a missing load cannot silently create a replacement session', async () => {
  const c = context()
  c.ctx.sdkSessionId = 'native'
  const f = fake(async (method, _params, update) => {
    if (method === 'session/load') {
      update({ sessionId: 'native', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'old reply' } } })
      throw new Error('not found')
    }
    return {}
  })
  await runHermesTurn(c.ctx, f.factory, async () => async () => undefined)
  assert.equal(f.calls.some(call => call.method === 'session/new' || call.method === 'session/prompt'), false)
  assert.equal(c.events.some(event => event.type === 'assistantDelta'), false)
})

test('permissions select allow_once only, reject another session and never grant persistent approval', async () => {
  const c = context(), f = fake()
  const input: Json[] = []
  c.ctx.canUseTool = async (_name, value) => { input.push(value); return { behavior: 'allow' } }
  const base = f.client.request
  f.client.request = async (method, params) => {
    if (method !== 'session/prompt') return base(method, params)
    const request = { sessionId: 'native', toolCall: { kind: 'execute', rawInput: { command: 'git status' } },
      options: [{ optionId: 'always', kind: 'allow_always' }, { optionId: 'once', kind: 'allow_once' }] }
    assert.deepEqual(await f.permission(request), { outcome: { outcome: 'selected', optionId: 'once' } })
    assert.deepEqual(await f.permission({ ...request, sessionId: 'other' }), { outcome: { outcome: 'cancelled' } })
    assert.deepEqual(await f.permission({ ...request, options: [{ optionId: 'always', kind: 'allow_always' }] }), { outcome: { outcome: 'cancelled' } })
    return base(method, params)
  }
  await runHermesTurn(c.ctx, f.factory, async () => async () => undefined)
  assert.equal(input.length, 2)
})

test('native cancellation must settle the prompt before releasing its guard', async () => {
  const c = context(), f = fake()
  let finish: ((result: Json) => void) | undefined, released = false
  const base = f.client.request
  f.client.request = async (method, params) => {
    if (method !== 'session/prompt') return base(method, params)
    return new Promise(resolve => { finish = resolve; c.controller.abort(); assert.equal(released, false) })
  }
  f.client.notify = (method, params) => {
    assert.equal(method, 'session/cancel'); assert.equal(params.sessionId, 'native')
    finish?.({ stopReason: 'cancelled' })
  }
  await runHermesTurn(c.ctx, f.factory, async () => async () => { released = true })
  assert.equal(c.events.at(-1)?.stopReason, 'interrupted')
  assert.equal(released, true)
})

test('lost prompt retains durable guard across tool restarts and blocks before native load', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'forge-hermes-guard-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const acquire = (id: string) => acquireHermesTurn(id, root)
  const c = context(), f = fake(async method => {
    if (method === 'session/new') return session
    if (method === 'session/prompt') throw new Error('lost connection')
    return {}
  })
  await runHermesTurn(c.ctx, f.factory, acquire)
  assert.ok(c.events.some(event => event.code === 'HERMES_TURN_UNCONFIRMED'))
  await assert.rejects(acquire('native'), /未确认/)
  const next = context(); next.ctx.sdkSessionId = 'native'
  await runHermesTurn(next.ctx, () => { assert.fail('blocked before load') }, acquire)
  assert.equal(next.events.at(-1)?.stopReason, 'error')
})

test('cancel without an authoritative native terminal stays unconfirmed and keeps the guard', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const c = context(), f = fake()
  let ready: () => void = () => undefined, released = false
  const prompting = new Promise<void>(resolve => { ready = resolve })
  const base = f.client.request
  f.client.request = async (method, params) => {
    if (method !== 'session/prompt') return base(method, params)
    c.controller.abort(); ready()
    return new Promise<Json>(() => undefined)
  }
  const work = runHermesTurn(c.ctx, f.factory, async () => async () => { released = true })
  await prompting
  t.mock.timers.tick(10001)
  await work
  assert.equal(released, false)
  assert.ok(c.events.some(event => event.code === 'HERMES_TURN_UNCONFIRMED'))
  assert.equal(c.events.at(-1)?.stopReason, 'error')
})

test('native refusal or limits cannot report success; authoritative terminal can release guard', async () => {
  for (const reason of ['refusal', 'max_tokens', 'max_turn_requests', 'unexpected']) {
    const c = context(), f = fake(async method => method === 'session/new' ? session : method === 'session/prompt' ? { stopReason: reason } : {})
    let released = false
    await runHermesTurn(c.ctx, f.factory, async () => async () => { released = true })
    assert.equal(c.events.at(-1)?.stopReason, 'error')
    assert.equal(released, reason !== 'unexpected')
  }
})

test('JSONL client handles server permission requests without shell execution and rejects malformed output', async () => {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill() { return true } })
  const launch = ((_command: string, _args: string[], options: { shell: boolean }) => { assert.equal(options.shell, false); return child }) as unknown as typeof spawn
  const wire: Json[] = []
  child.stdin.on('data', chunk => wire.push(JSON.parse(String(chunk))))
  const client = new HermesAcpClient(() => undefined, async () => ({ outcome: { outcome: 'cancelled' } }), launch)
  const pending = client.request('initialize', {})
  child.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: initialized }) + '\n')
  assert.deepEqual(await pending, initialized)
  child.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 'perm', method: 'session/request_permission', params: {} }) + '\n')
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(wire.find(value => value.id === 'perm')?.result, { outcome: { outcome: 'cancelled' } })
  const invalid = client.request('session/prompt', {})
  child.stdout.write('not json\n')
  await assert.rejects(invalid, /无效/)
  client.close()
})
