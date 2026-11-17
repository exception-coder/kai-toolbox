import assert from 'node:assert/strict'
import test from 'node:test'
import { missingAssistantText, runOpencodeTurn } from './opencodeEngine.js'

test('OpenCode prompt response recovers text when SSE was missed', () => {
  assert.equal(missingAssistantText('完整回答', '', false), '完整回答')
})

test('OpenCode prompt response only appends the part missing from SSE', () => {
  assert.equal(missingAssistantText('完整回答', '完整', true), '回答')
  assert.equal(missingAssistantText('完整回答', '完整回答', true), '')
})

test('OpenCode prompt response does not duplicate divergent streamed text', () => {
  assert.equal(missingAssistantText('新文本', '旧文本', true), '')
})

test('OpenCode review disables every native tool, fails closed on inventory errors, and closes its runtime', async () => {
  for (const inventoryError of [false, true]) {
    let closed = false, prompted = false
    const events: Record<string, unknown>[] = []
    const signal = new AbortController().signal
    await runOpencodeTurn({ text: 'material', cwd: '.', signal, toolPolicy: 'disabled', permissionMode: 'default',
      autoApprove: true, emit: event => events.push(event), setSdkSessionId() {} }, (async (options: { config: { tools: unknown } }) => {
      assert.deepEqual(options.config.tools, { '*': false })
      return { server: { close() { closed = true } }, client: {
        event: { subscribe: ({ signal }: { signal: AbortSignal }) => new Promise(resolve => signal.addEventListener('abort', () => resolve({ stream: [] }), { once: true })) },
        tool: { ids: async () => inventoryError ? { error: 'unavailable' } : { data: ['bash', 'read', 'mcp__custom'] } },
        session: { create: async () => ({ data: { id: 'independent-review' } }),
          prompt: async (request: { signal: AbortSignal; body: { tools: unknown } }) => {
            prompted = true
            assert.equal(request.signal, signal)
            assert.deepEqual(request.body.tools, { bash: false, read: false, mcp__custom: false })
            return { data: { parts: [{ type: 'text', id: 'text', text: 'opinion' }] } }
          } },
      } }
    }) as never)
    assert.equal(closed, true)
    assert.equal(prompted, !inventoryError)
    assert.equal(events.some(event => event.stopReason === 'end_turn'), !inventoryError)
  }
})
