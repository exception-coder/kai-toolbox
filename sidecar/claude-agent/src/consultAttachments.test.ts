import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { consultAttachmentTool, readConsultAttachment } from './consultAttachments.js'

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
    assert.equal(result.isError, true); assert.match(String(result.content[0].text ?? ''), /管理员/)
    assert.equal(receivedToken, 'signed'); assert.equal(url, '/api/fore-consult/attachments/sessions/s/read')
    assert.deepEqual(received, { path: 'report.html', offset: 12000, maxChars: 12000 })
    await assert.rejects(readConsultAttachment({ path: 'x' }, { apiBase, session: 's' }), /上下文/)
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
})

test('workbook pagination is forwarded separately from character offsets with structured results', async () => {
  let received: unknown
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += String(chunk)
    received = JSON.parse(body)
    res.end(JSON.stringify({ kind: 'workbook', sheet: '款号库存', totalRows: 2219, startRow: 101,
      nextRow: 201, complete: false, rows: [{ row: 101, cells: [{ coordinate: 'A101', raw: '00123' }] }] }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const apiBase = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    const args = { path: 'stock.xlsx', sheet: '款号库存', startRow: 101, maxRows: 100 }
    const result = await readConsultAttachment(args, { apiBase, session: 's', token: 'signed' })
    assert.deepEqual(received, args)
    assert.equal(JSON.parse(String(result.content[0].text ?? '')).rows[0].cells[0].raw, '00123')
    assert.equal(JSON.parse(String(result.content[0].text ?? '')).nextRow, 201)
    assert.equal(consultAttachmentTool.inputSchema.properties.maxRows.maximum, 500)
    assert.match(consultAttachmentTool.description, /不计算/)
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
})

test('oversized responses are errors instead of silently truncated workbook JSON', async () => {
  const server = createServer((_req, res) => res.end('x'.repeat(350001)))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const apiBase = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    const result = await readConsultAttachment({ path: 'stock.xlsx' }, { apiBase, session: 's', token: 'signed' })
    assert.equal(result.isError, true)
    assert.match(String(result.content[0].text ?? ''), /不能把截断内容当成完整数据/)
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
})

test('an authorized original image is returned as image content rather than just its filename', async () => {
  const server = createServer((_req, res) => res.end(JSON.stringify({ kind: 'image', mimeType: 'image/png', data: 'aW1hZ2U=' })))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const apiBase = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    const result = await readConsultAttachment({ path: 'original.png' }, { apiBase, session: 's', token: 'signed' })
    assert.equal(result.content[0].type, 'image')
    assert.equal(result.content[0].data, 'aW1hZ2U=')
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
})
