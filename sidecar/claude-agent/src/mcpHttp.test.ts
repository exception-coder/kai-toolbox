import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { fetchMcpHttpText, type McpRequestExtra } from './mcpHttp.js'

test('HTTP-backed MCP reports meaningful execution phases', async t => {
  const server = http.createServer((_request, response) => {
    setTimeout(() => {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end('{"ok":true}')
    }, 20)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')

  const messages: string[] = []
  const extra: McpRequestExtra = {
    _meta: { progressToken: 'progress-1' },
    sendNotification: async notification => {
      messages.push(notification.params.message ?? '')
    },
  }
  const result = await fetchMcpHttpText(
    `http://127.0.0.1:${address.port}/mcp`,
    { method: 'POST' },
    extra,
    '登记待执行 SQL',
  )

  assert.equal(result.response.status, 200)
  assert.equal(result.text, '{"ok":true}')
  assert.match(messages[0] ?? '', /步骤 1\/4.*连接 Forge 后端/)
  assert.match(messages.at(-1) ?? '', /步骤 4\/4.*处理完成/)
})

test('HTTP-backed MCP propagates caller cancellation to fetch', async t => {
  const server = http.createServer(() => undefined)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')

  const controller = new AbortController()
  setTimeout(() => controller.abort(new Error('turn cancelled')), 20)
  await assert.rejects(fetchMcpHttpText(
    `http://127.0.0.1:${address.port}/mcp`,
    { method: 'POST' },
    { signal: controller.signal },
    '查询业务知识',
  ))
})

test('an unresponsive progress consumer never blocks the MCP operation', async t => {
  const server = http.createServer((_request, response) => response.end('done'))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')

  const result = await fetchMcpHttpText(
    `http://127.0.0.1:${address.port}/mcp`,
    { method: 'POST' },
    {
      _meta: { progressToken: 'stuck-progress-consumer' },
      sendNotification: () => new Promise(() => undefined),
    },
    '查询测试库',
  )

  assert.equal(result.text, 'done')
})
