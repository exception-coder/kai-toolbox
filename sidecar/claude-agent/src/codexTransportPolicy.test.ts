import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CODEX_HTTPS_PROVIDER, CODEX_WS_CONTEXT_BUDGET_BYTES, codexHistoryBytes,
  prepareCodexTransport, selectCodexTransport } from './codexTransportPolicy.js'

const jsonl = (...entries: unknown[]) => entries.map(entry => JSON.stringify(entry)).join('\n') + '\n'
const response = (text: string) => ({ type: 'response_item', payload: { type: 'message', role: 'user',
  content: [{ type: 'input_text', text }] } })
const compact = (items: unknown[]) => ({ type: 'compacted', payload: { replacement_history: items } })

async function fixture(t: test.TestContext) {
  const home = await mkdtemp(join(tmpdir(), 'forge-codex-transport-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const directory = join(home, 'sessions', '2026', '10', '14')
  await mkdir(directory, { recursive: true })
  const path = join(directory, 'rollout-test-thread.jsonl')
  await writeFile(path, jsonl(response('old message')))
  const options = { threadId: 'thread', codexHome: home, cwd: home, input: [{ type: 'text', text: 'continue' }],
    config: { 'features.realtime_conversation': true, 'mcp_servers.toolbox.enabled': false } }
  const request = async (method: string) => {
    if (method === 'config/read') return { config: { model_provider: 'openai' } }
    if (method === 'thread/read') return { thread: { path, modelProvider: 'openai' } }
    throw new Error(`Unexpected request: ${method}`)
  }
  return { home, path, options, request }
}

test('two independent sends use HTTPS before execution for oversized retained images, without rewriting history', async t => {
  const f = await fixture(t)
  const image = { type: 'message', role: 'user', content: [{ type: 'input_image',
    image_url: `data:image/png;base64,${'a'.repeat(CODEX_WS_CONTEXT_BUDGET_BYTES)}` }] }
  const history = jsonl(compact([image]), response('short follow-up'))
  await writeFile(f.path, history)
  for (let turn = 0; turn < 2; turn++) {
    const chosen = await selectCodexTransport(f.options, f.request)
    assert.equal(chosen.modelProvider, CODEX_HTTPS_PROVIDER)
    assert.equal(chosen.reason, 'large_context')
    const provider = chosen.config[`model_providers.${CODEX_HTTPS_PROVIDER}`] as Record<string, unknown>
    assert.equal(provider.supports_websockets, false)
    assert.equal(provider.requires_openai_auth, true)
    assert.equal(provider.name, 'OpenAI')
    assert.equal(provider.base_url, undefined, 'native auth must select ChatGPT/API endpoint')
    assert.equal(provider.stream_max_retries, undefined, 'do not weaken HTTPS retries')
    assert.equal(chosen.config['mcp_servers.toolbox.enabled'], false)
  }
  assert.equal(await readFile(f.path, 'utf8'), history)
  assert.deepEqual(Object.keys(f.options.config).sort(), ['features.realtime_conversation', 'mcp_servers.toolbox.enabled'])
})

test('latest compaction and UTF-8 byte size govern transport, not cumulative file size', async t => {
  const f = await fixture(t)
  await writeFile(f.path, jsonl(response('图'.repeat(CODEX_WS_CONTEXT_BUDGET_BYTES / 3)), compact([]), response('small')))
  const small = await selectCodexTransport(f.options, f.request)
  assert.equal(small.modelProvider, undefined)
  assert.ok(small.contextBytes! < 1024)
  await writeFile(f.path, jsonl(compact([response('图'.repeat(CODEX_WS_CONTEXT_BUDGET_BYTES / 3)).payload])))
  assert.equal((await selectCodexTransport(f.options, f.request)).modelProvider, CODEX_HTTPS_PROVIDER)
  await writeFile(f.path, jsonl(compact([]), response('smaller again')))
  const selected = await selectCodexTransport(f.options, async method => method === 'thread/read'
    ? { thread: { path: f.path, modelProvider: CODEX_HTTPS_PROVIDER } } : f.request(method))
  assert.equal(selected.modelProvider, 'openai')
  assert.equal(selected.reason, undefined)
})

test('new local images count base64 expansion without reading image contents', async t => {
  const f = await fixture(t)
  const image = join(f.home, 'image.png')
  await writeFile(image, Buffer.alloc(CODEX_WS_CONTEXT_BUDGET_BYTES * 3 / 4))
  const chosen = await selectCodexTransport({ ...f.options, threadId: undefined,
    input: [{ type: 'localImage', path: image }] }, f.request)
  assert.equal(chosen.modelProvider, CODEX_HTTPS_PROVIDER)
})

test('different auth homes and custom providers never inherit another conversation decision', async t => {
  const large = await fixture(t)
  const small = await fixture(t)
  await writeFile(large.path, jsonl(response('x'.repeat(CODEX_WS_CONTEXT_BUDGET_BYTES))))
  assert.equal((await selectCodexTransport(large.options, large.request)).reason, 'large_context')
  assert.equal((await selectCodexTransport(small.options, small.request)).reason, undefined)
  const custom = await selectCodexTransport(large.options, async method => {
    assert.equal(method, 'config/read')
    return { config: { model_provider: 'my_gateway' } }
  })
  assert.equal(custom.modelProvider, undefined)
})

test('malformed history, invalid metadata and custom endpoints remain observable without replay', async t => {
  const f = await fixture(t)
  await writeFile(f.path, '{invalid\n')
  await assert.rejects(selectCodexTransport(f.options, f.request), SyntaxError)
  await assert.rejects(selectCodexTransport(f.options, async method => method === 'thread/read'
    ? { thread: { path: join(f.home, 'auth.json') } } : f.request(method)), /ENOENT|outside/)
  await assert.rejects(selectCodexTransport({ ...f.options, config: { openai_base_url: 'https://example.com/v1' } }, f.request), /Custom Codex/)
  const warnings: unknown[][] = []
  t.mock.method(console, 'warn', (...args: unknown[]) => { warnings.push(args) })
  let calls = 0
  const chosen = await prepareCodexTransport(f.options, async (method) => { calls++; return f.request(method) })
  assert.deepEqual(chosen, { config: f.options.config })
  assert.equal(calls, 2)
  assert.match(String(warnings[0]?.[0]), /codex_transport_preflight_failed/)
  assert.doesNotMatch(String(warnings[0]?.[0]), /invalid\n/)
})

test('reserved alias collisions fail visibly and do not overwrite user configuration', async t => {
  const f = await fixture(t)
  await assert.rejects(selectCodexTransport(f.options, async () => ({ config: {
    model_provider: 'openai', model_providers: { [CODEX_HTTPS_PROVIDER]: { name: 'user choice' } },
  } })), /conflicts/)
})

test('event logs and legacy compaction cannot erase retained size evidence', async t => {
  const f = await fixture(t)
  const item = response('retained')
  await writeFile(f.path, jsonl(item, { type: 'event_msg', payload: { text: 'x'.repeat(4000) } },
    { type: 'compacted', payload: { message: 'legacy summary' } }))
  assert.equal(await codexHistoryBytes(f.path), Buffer.byteLength(JSON.stringify(item.payload)))
})
