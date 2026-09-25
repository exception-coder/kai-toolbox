import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { runPiTurn } from './piEngine.js'
import { runCopilotTurn } from './copilotEngine.js'
import type { EmbeddedEngineContext } from './engine/embeddedEngineContext.js'

for (const [name, execute] of [['Pi', runPiTurn], ['Copilot', runCopilotTurn]] as const) {
  test(`${name} native SDK streams and resumes against a local BYOK fixture`, { timeout: 90_000 }, async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'forge-engine-test-'))
    const requests: { model: string; authorization: string | undefined }[] = []
    let stall = false
    const server = createServer(async (req, res) => {
      let body = ''
      for await (const chunk of req) body += chunk
      if (!req.url?.endsWith('/chat/completions')) { res.writeHead(404).end(); return }
      const parsed = JSON.parse(body)
      requests.push({ model: parsed.model, authorization: req.headers.authorization })
      if (stall) { setTimeout(() => controller.abort(), 25); return }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      for (const [delta, finish] of [[{ role: 'assistant', content: 'fixture OK' }, null], [{}, 'stop']]) {
        res.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture-model', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)
      }
      res.end('data: [DONE]\n\n')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as { port: number }).port
    let handle: string | undefined
    if (name === 'Pi') {
      handle = join(cwd, 'session.jsonl')
      await writeFile(handle, `${JSON.stringify({ type: 'session', version: 3, id: randomUUID(), timestamp: new Date().toISOString(), cwd })}\n`)
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)
    try {
      for (let turn = 0; turn < 2; turn++) {
        const events: Record<string, unknown>[] = []
        const previous = handle
        const ctx: EmbeddedEngineContext = { cwd, text: 'Reply briefly without tools.',
          model: 'fixture-model', apiBaseUrl: `http://127.0.0.1:${port}/v1`, authToken: 'fixture-key',
          sdkSessionId: handle, signal: controller.signal, emit: event => events.push(event),
          setSdkSessionId: id => { handle = id }, canUseTool: async () => ({ behavior: 'deny' }) }
        await execute(ctx)
        assert.equal(events.at(-1)?.stopReason, 'end_turn', JSON.stringify(events))
        assert.ok(events.some(event => event.type === 'assistantDelta' && String(event.text).includes('fixture OK')))
        assert.ok(handle)
        if (previous) assert.equal(handle, previous)
      }
      assert.ok(requests.length >= 2)
      assert.ok(requests.every(request => request.model === 'fixture-model' && request.authorization === 'Bearer fixture-key'))
      stall = true
      const interrupted: Record<string, unknown>[] = []
      await execute({ cwd, text: 'Wait for a response.', model: 'fixture-model',
        apiBaseUrl: `http://127.0.0.1:${port}/v1`, authToken: 'fixture-key', sdkSessionId: handle,
        signal: controller.signal, emit: event => interrupted.push(event), setSdkSessionId: () => undefined,
        canUseTool: async () => ({ behavior: 'deny' }) })
      assert.equal(interrupted.at(-1)?.stopReason, 'interrupted', JSON.stringify(interrupted))
    } finally {
      clearTimeout(timeout)
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
      await rm(cwd, { recursive: true, force: true })
    }
  })
}
