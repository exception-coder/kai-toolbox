import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runOpencodeTurn } from '../opencodeEngine.js'

test('native OpenCode isolates concurrent gateway keys and resumes its session', { timeout: 110_000 }, async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'forge-opencode-native-'))
  const requests: { model: string; key: string; messages: unknown[] }[] = []
  let stall = false
  let requestReceived: (() => void) | undefined
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
    requests.push({ model: body.model, key: request.headers.authorization ?? '', messages: body.messages ?? [] })
    if (stall) { requestReceived?.(); return }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    for (const [delta, finish_reason] of [[{ role: 'assistant', content: 'FORGE_TEST_OK' }, null], [{}, 'stop']]) {
      response.write(`data: ${JSON.stringify({ id: 'chatcmpl-test', object: 'chat.completion.chunk',
        created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
    }
    response.end('data: [DONE]\n\n')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const apiBaseUrl = `http://127.0.0.1:${address.port}/v1`
  const handles = new Map<string, string>()
  async function turn(model: string, signal: AbortSignal) {
    const events: Record<string, unknown>[] = []
    await runOpencodeTurn({ text: 'Reply with the test acknowledgement only; do not call tools.', cwd,
      apiBaseUrl, model, authToken: `test-key-${model}`, sdkSessionId: handles.get(model), signal,
      emit: event => events.push(event), setSdkSessionId: id => handles.set(model, id),
      permissionMode: 'plan', autoApprove: false, toolPolicy: 'review-only' })
    return events
  }
  try {
    const signal = AbortSignal.timeout(75_000)
    const first = await Promise.all([turn('model-a', signal), turn('model-b', signal)])
    for (const events of first) {
      assert.ok(events.some(event => event.type === 'assistantDelta' && String(event.text).includes('FORGE_TEST_OK')),
        JSON.stringify(events.filter(event => event.type === 'error')))
    }
    const handle = handles.get('model-a')
    assert.ok(handle)
    assert.notEqual(handle, handles.get('model-b'))
    const resumed = await turn('model-a', signal)
    assert.equal(handles.get('model-a'), handle)
    assert.ok(resumed.some(event => event.type === 'result' && event.stopReason === 'end_turn'))
    assert.ok(requests.some(request => request.model === 'model-a' && request.messages.length > 2))
    for (const request of requests) assert.equal(request.key, `Bearer test-key-${request.model}`)
    stall = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    requestReceived = () => controller.abort()
    try {
      const interrupted = await turn('model-a', controller.signal)
      assert.ok(interrupted.some(event => event.type === 'result' && event.stopReason === 'interrupted'))
    } finally { clearTimeout(timeout) }
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(cwd, { recursive: true, force: true })
  }
})
