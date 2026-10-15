import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readConsultAttachment } from './consultAttachments.js'

test('attachment reader forwards signed identity and pagination, reporting policy rejection', async () => {
  let received: unknown; let receivedToken: unknown; let url: unknown
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += String(chunk)
    received = JSON.parse(body); receivedToken = req.headers['x-consult-resource-token']; url = req.url
    res.statusCode = 413; res.end('管理员配置的读取上限')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const apiBase = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    const result = await readConsultAttachment({ path: 'report.html', offset: 12000, maxChars: 12000 }, { apiBase, session: 's', token: 'signed' })
    assert.equal(result.isError, true); assert.match(result.content[0].text, /管理员/)
    assert.equal(receivedToken, 'signed'); assert.equal(url, '/api/fore-consult/attachments/sessions/s/read')
    assert.deepEqual(received, { path: 'report.html', offset: 12000, maxChars: 12000 })
    await assert.rejects(readConsultAttachment({ path: 'x' }, { apiBase, session: 's' }), /上下文/)
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
})
