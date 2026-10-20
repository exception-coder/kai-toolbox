import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { synchronizeConsultSource } from './consultSourceSync.js'

test('source synchronization is a signed POST, reports provenance and fails closed for unknown or ongoing writes', async () => {
  let status = 200
  let value: unknown = { status: 'UPDATED', message: '已同步', branch: 'main', headAtCheck: 'b'.repeat(40), checkedAt: 100 }
  const bodies: unknown[] = []
  const server = createServer(async (req, res) => {
    assert.equal(req.method, 'POST')
    assert.equal(req.url, '/api/fore-consult/resources/sessions/runtime/source-sync')
    assert.equal(req.headers['x-consult-resource-token'], 'trusted')
    let body = ''; for await (const chunk of req) body += String(chunk)
    bodies.push(JSON.parse(body))
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const context = { apiBase: `http://127.0.0.1:${(server.address() as { port: number }).port}`, session: 'runtime', token: 'trusted' }
  try {
    assert.equal(await synchronizeConsultSource({ apiBase: '' }), null)
    assert.equal((await synchronizeConsultSource(context, 'project'))?.headAtCheck, 'b'.repeat(40))
    assert.deepEqual(bodies[0], { project: 'project' })
    value = { status: 'SYNCING', message: 'running', branch: null, headAtCheck: null, checkedAt: 1 }
    await assert.rejects(synchronizeConsultSource(context, 'project'), /仍在同步/)
    value = { status: 'UNVERIFIED', message: '未同步，使用本地', branch: null, headAtCheck: null, checkedAt: 2 }
    assert.equal((await synchronizeConsultSource(context))?.status, 'UNVERIFIED')
    status = 403
    await assert.rejects(synchronizeConsultSource(context, 'project'), /状态未确认/)
    status = 404
    assert.match((await synchronizeConsultSource(context, 'project'))!.message, /尚未部署/)
    status = 200; value = { status: 'SUCCESS_WITHOUT_EVIDENCE' }
    await assert.rejects(synchronizeConsultSource(context, 'project'), /结果无效/)
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
  await assert.rejects(synchronizeConsultSource(context, 'project'), /状态未确认/)
})
