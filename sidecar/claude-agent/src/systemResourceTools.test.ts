import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { discoverSystemResources, executeSystemResource } from './systemResourceTools.js'
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
      assert.equal(listed.tools.some(tool => tool.name === 'discover_resources'), enabled)
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
