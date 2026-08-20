import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  createGraphifyRuntimeRequestHandler,
  extractGraphifyTextContent,
  GraphifyRuntime,
  graphifyRuntimeChildEnv,
} from './graphifyRuntime.js'
import type { GraphifyBackend, GraphifyBackendSnapshot } from './graphifyRuntimeTypes.js'

class FakeBackend implements GraphifyBackend {
  calls = 0
  closes = 0
  run: () => Promise<string> = async () => 'graph-result'

  async query(): Promise<string> {
    this.calls += 1
    return this.run()
  }

  snapshot(): GraphifyBackendSnapshot {
    return { state: 'READY', pid: 123, consecutiveFailures: 0 }
  }

  async close(): Promise<void> {
    this.closes += 1
  }
}

function graphProject(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'graphify-runtime-test-'))
  mkdirSync(path.join(root, 'graphify-out'))
  writeFileSync(path.join(root, 'graphify-out', 'graph.json'), '{}', 'utf8')
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

test('extracts and joins Graphify MCP text blocks', () => {
  assert.equal(extractGraphifyTextContent({
    content: [
      { type: 'text', text: ' first ' },
      { type: 'image', data: 'ignored', mimeType: 'image/png' },
      { type: 'text', text: 'second' },
    ],
  }), 'first\nsecond')
})

test('rejects empty or error Graphify MCP results', () => {
  assert.throws(() => extractGraphifyTextContent({ content: [] }), /未返回文本/)
  assert.throws(() => extractGraphifyTextContent({
    isError: true,
    content: [{ type: 'text', text: 'query failed' }],
  }), /query failed/)
})

test('builds loopback-only child access environment', () => {
  const env = graphifyRuntimeChildEnv(19999)
  assert.equal(env.CONSULT_GRAPHIFY_RUNTIME_URL, 'http://127.0.0.1:19999/internal/graphify/query')
  assert.ok(env.CONSULT_GRAPHIFY_RUNTIME_TOKEN.length >= 32)
})

test('internal Graphify endpoint rejects missing token before invoking runtime', async () => {
  let called = false
  const runtime = {
    async query() {
      called = true
      return { status: 'ready' as const, state: 'READY' as const, text: 'ok', durationMs: 1, channel: 'persistent-mcp' as const, cached: false }
    },
    snapshot() {
      return {
        backend: { state: 'READY' as const, pid: 1, consecutiveFailures: 0 },
        scheduler: { queued: 0, inFlight: 0, cached: 0 },
        projects: [],
      }
    },
  }
  const server = createServer(createGraphifyRuntimeRequestHandler(runtime, 'test-token'))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const response = await fetch(`http://127.0.0.1:${address.port}/internal/graphify/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(response.status, 401)
    assert.equal(called, false)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('internal Graphify endpoint exposes warming and authenticated health states', async () => {
  const runtime = {
    async query() {
      return {
        status: 'pending' as const,
        state: 'WARMING' as const,
        code: 'GRAPHIFY_WARMING' as const,
        phase: 'loading-project-graph' as const,
        retryAfterMs: 5_000,
        message: 'warming',
        durationMs: 10,
      }
    },
    snapshot() {
      return {
        backend: { state: 'READY' as const, pid: 123, consecutiveFailures: 0 },
        scheduler: { activeKey: 'query', queued: 0, inFlight: 1, cached: 0 },
        projects: [],
      }
    },
  }
  const server = createServer(createGraphifyRuntimeRequestHandler(runtime, 'test-token'))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const base = `http://127.0.0.1:${address.port}`
    const headers = { 'Authorization': 'Bearer test-token', 'Content-Type': 'application/json' }
    const queryResponse = await fetch(`${base}/internal/graphify/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    assert.equal(queryResponse.status, 202)
    assert.equal((await queryResponse.json() as { code?: string }).code, 'GRAPHIFY_WARMING')

    const statusResponse = await fetch(`${base}/internal/graphify/status`, { headers })
    assert.equal(statusResponse.status, 200)
    const status = await statusResponse.json() as { scheduler?: { inFlight?: number } }
    assert.equal(status.scheduler?.inFlight, 1)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('returns warming without cancelling the shared backend task and serves its cached result later', async () => {
  const project = graphProject()
  const backend = new FakeBackend()
  let release!: (value: string) => void
  backend.run = () => new Promise(resolve => { release = resolve })
  const runtime = new GraphifyRuntime(backend, undefined, { requestWaitMs: 10, backendTimeoutMs: 1_000 })
  const query = { projectPath: project.root, question: 'find service', tokenBudget: 500 } as const
  try {
    const first = await runtime.query(query)
    assert.equal(first.status, 'pending')
    assert.equal(backend.closes, 0)
    release('warmed-result')
    await new Promise(resolve => setTimeout(resolve, 0))

    const second = await runtime.query(query)
    assert.equal(second.status, 'ready')
    if (second.status === 'ready') {
      assert.equal(second.text, 'warmed-result')
      assert.equal(second.cached, true)
    }
    assert.equal(backend.calls, 1)
  } finally {
    project.cleanup()
  }
})

test('does not close the shared backend after a single query failure', async () => {
  const project = graphProject()
  const backend = new FakeBackend()
  backend.run = async () => { throw new Error('query rejected') }
  const runtime = new GraphifyRuntime(backend, undefined, { requestWaitMs: 100 })
  try {
    await assert.rejects(runtime.query({
      projectPath: project.root,
      question: 'failing query',
      tokenBudget: 500,
    }), /query rejected/)
    assert.equal(backend.closes, 0)
    assert.equal(runtime.snapshot().projects[0]?.state, 'DEGRADED')
  } finally {
    project.cleanup()
  }
})
