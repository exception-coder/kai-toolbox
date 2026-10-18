import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

test('readonly resource MCP forwards trusted session header and refuses writes before HTTP', async () => {
  const requests: { url: string; token: string | string[] | undefined; body: string }[] = []
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += String(chunk)
    requests.push({ url: req.url!, token: req.headers['x-consult-resource-token'], body })
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  const child = spawn(process.execPath, [fileURLToPath(new URL('./readonlyMcp.js', import.meta.url))], {
    windowsHide: true, env: { ...process.env, TOOLBOX_API_BASE: `http://127.0.0.1:${address.port}`,
      CONSULT_DISABLE_LEGACY_DATABASES: 'true', TOOLBOX_SOURCE_ROOT: '', TOOLBOX_SESSION_ID: 'runtime-test', CONSULT_RESOURCE_TOKEN: 'trusted-test-token',
      CONSULT_ENABLED_TOOLS: JSON.stringify(['consult_resources', 'consult_resource_query', 'consult_web', 'erp_db_query', 'generate_consult_document', 'read_consult_attachment']) }, stdio: ['pipe', 'pipe', 'pipe'],
  })
  const replies = new Map<number, (value: Record<string, any>) => void>()
  const lines = createInterface({ input: child.stdout })
  lines.on('line', line => { const value = JSON.parse(line); replies.get(value.id)?.(value) })
  let id = 0
  const request = (method: string, params: unknown) => new Promise<Record<string, any>>((resolve, reject) => {
    const key = ++id; const timeout = setTimeout(() => reject(new Error('MCP response timeout')), 5000)
    replies.set(key, value => { clearTimeout(timeout); replies.delete(key); resolve(value) })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: key, method, params }) + '\n')
  })
  try {
    const list = await request('tools/list', {})
    assert.deepEqual(list.result.tools.map((tool: { name: string }) => tool.name), ['consult_resources', 'consult_resource_query', 'consult_web', 'generate_consult_document', 'read_consult_attachment'])
    assert.equal(list.result.tools[3].annotations.readOnlyHint, false)
    assert.equal(list.result.tools[3].inputSchema.additionalProperties, false)
    await request('tools/call', { name: 'consult_resources', arguments: {} })
    await request('tools/call', { name: 'consult_resource_query', arguments: { bindingId: 'binding', sql: 'select 1' } })
    const denied = await request('tools/call', { name: 'consult_resource_query', arguments: { bindingId: 'binding', sql: 'delete from orders' } })
    assert.equal(denied.result.isError, true)
    const legacy = await request('tools/call', { name: 'erp_db_query', arguments: { sql: 'select 1' } })
    assert.equal(legacy.result.isError, true)
    const document = { format: 'xlsx', title: '确认表', sheets: [{ name: '口径', columns: ['指标'], rows: [['周转率']] }] }
    await request('tools/call', { name: 'generate_consult_document', arguments: document })
    assert.equal(requests.length, 3)
    assert.equal(requests[2].url, '/api/fore-consult/document-tools/sessions/runtime-test')
    assert.equal(requests[2].token, 'trusted-test-token')
    assert.deepEqual(JSON.parse(requests[2].body), document)
    const oversized = await request('tools/call', { name: 'generate_consult_document', arguments: { title: 'x'.repeat(300_001) } })
    assert.equal(oversized.result.isError, true)
    assert.equal(requests.length, 3)
    assert.equal(requests[0].url, '/api/fore-consult/resources/sessions/runtime-test')
    assert.equal(requests[0].token, 'trusted-test-token')
    assert.deepEqual(JSON.parse(requests[1].body), { bindingId: 'binding', sql: 'select 1' })
    await request('tools/call', { name: 'read_consult_attachment', arguments: { path: 'report.html', offset: 12000 } })
    assert.equal(requests.length, 4)
    assert.equal(requests[3].url, '/api/fore-consult/attachments/sessions/runtime-test/read')
    assert.equal(requests[3].token, 'trusted-test-token')
    assert.deepEqual(JSON.parse(requests[3].body), { path: 'report.html', offset: 12000 })
    await request('tools/call', { name: 'consult_web', arguments: { operation: 'DISCOVER' } })
    await request('tools/call', { name: 'consult_web', arguments: { operation: 'READ', bindingId: 'web-uat', url: 'https://uat.test/orders', environment: 'UAT' } })
    assert.equal(requests[4].url, '/api/fore-consult/resources/sessions/runtime-test/web')
    assert.equal(requests[5].token, 'trusted-test-token')
    assert.deepEqual(JSON.parse(requests[5].body), { bindingId: 'web-uat', url: 'https://uat.test/orders', environment: 'UAT' })
    const credentials = await request('tools/call', { name: 'consult_web', arguments: { operation: 'READ', bindingId: 'web-uat', password: 'secret' } })
    assert.equal(credentials.result.isError, true)
    assert.equal(requests.length, 6)
  } finally {
    child.kill(); lines.close(); await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
