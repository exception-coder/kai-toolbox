import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { discoverSystemResources, executeSystemResource, executeResourceSchema } from './systemResourceTools.js'
import { createForgePendingSqlServer } from './forgePendingSql.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

test('SDK tools preserve the restricted consultation inventory', async () => {
  for (const enabled of [false, true]) {
    const server = createForgePendingSqlServer('session', 'http://127.0.0.1:1', enabled)
    const client = new Client({ name: 'inventory-test', version: '1' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    try {
      await server.instance.connect(serverTransport)
      await client.connect(clientTransport)
      const listed = await client.listTools()
      const removed = await client.callTool({ name: 'register_pending_sql', arguments: {} })
      assert.equal(removed.isError, true)
      assert.deepEqual(listed.tools.map(tool => tool.name).sort(), enabled
        ? ['discover_resources', 'execute_resource', 'prepare_page_preview', 'prepare_sql_context', 'report_session_progress']
        : ['prepare_sql_context', 'report_session_progress'])
      assert.equal(listed.tools.some(tool => tool.name === 'discover_resources'), enabled)
      assert.equal(listed.tools.some(tool => tool.name === 'prepare_page_preview'), enabled)
      assert.equal(listed.tools.some(tool => tool.name === 'execute_resource'), enabled)
    } finally { await client.close(); await server.instance.close() }
  }
})

test('resource tools share structured discovery and execute by encoded binding reference', async t => {
  const requests: { path?: string; method?: string; body: string }[] = []
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', chunk => { body += String(chunk) })
    request.on('end', () => {
      requests.push({ path: request.url, method: request.method, body })
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ available: true }))
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}`
  const result = await discoverSystemResources(base, { systemId: 'a/b' })
  assert.deepEqual(result.structuredContent, { result: { available: true } })
  assert.deepEqual(JSON.parse(result.content[0]!.text), result.structuredContent)
  await executeSystemResource(base, { bindingId: 'bound/id', operation: 'QUERY', sql: 'select 1' })
  assert.deepEqual(requests, [
    { path: '/api/ops/resources/systems/a%2Fb', method: 'GET', body: '' },
    { path: '/api/ops/resources/bindings/bound%2Fid/execute', method: 'POST', body: '{"operation":"QUERY","sql":"select 1"}' },
  ])
})

test('resource tools mark server rejection as tool error', async t => {
  const server = http.createServer((_request, response) => { response.writeHead(400); response.end('资源关系已停用') })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const result = await executeSystemResource(`http://127.0.0.1:${address.port}`, { bindingId: 'id', operation: 'TEST' })
  assert.equal(result.isError, true)
  assert.match(result.content[0]!.text, /HTTP 400.*已停用/)
})

test('write operation requires declaration and runtime identity without sending incomplete requests', async () => {
  const args = { bindingId: 'id', operation: 'EXECUTE' as const, sql: 'update orders set status=1' }
  for (const [input, session] of [[args, 'session'], [{ ...args, writeAuthorization: {
    userInstruction: '允许执行本次测试库更新', scope: 'TEST/orders/status', requestId: '2736707c-75c2-4beb-9ba5-31c04edd1531',
  } }, undefined]] as const) {
    const result = await executeSystemResource('http://127.0.0.1:1', input, undefined, session)
    assert.equal(result.isError, true)
    assert.match(result.content[0]!.text, /WRITE_AUTHORIZATION_REQUIRED.*未发送/)
  }
  assert.equal(executeResourceSchema.operation.safeParse('EXECUTE').success, true)
})

test('SQL write forwards bound session and stable request; transport failure never retries', async t => {
  const received: Record<string, unknown>[] = []
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', chunk => { body += String(chunk) })
    request.on('end', () => {
      received.push(JSON.parse(body) as Record<string, unknown>)
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end('') // 模拟外部已执行，但传输未返回完整 JSON。
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const writeAuthorization = { userInstruction: '允许执行本次测试库更新', scope: 'TEST/orders/status', requestId: '2736707c-75c2-4beb-9ba5-31c04edd1531' }
  const result = await executeSystemResource(`http://127.0.0.1:${address.port}`, {
    bindingId: 'id', operation: 'EXECUTE', sql: 'update orders set status=1', writeAuthorization,
  }, undefined, 'bound-session')
  assert.equal(result.isError, true)
  assert.match(result.content[0]!.text, /禁止自动换 ID 重试/)
  assert.equal(received.length, 1)
  assert.deepEqual(received[0]?.writeAuthorization, { ...writeAuthorization, sessionId: 'bound-session' })
})
