import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { callConsultDocumentTool } from './consultDocumentMcp.js'
import { consultDocumentTool } from './consultDocuments.js'

test('large inventory exports cross the old 300k ceiling but remain bounded and signed', async () => {
  let received = ''; let token: unknown; let calls = 0
  const server = createServer(async (req, res) => {
    calls++; token = req.headers['x-consult-resource-token']
    req.setEncoding('utf8')
    received = ''; for await (const chunk of req) received += String(chunk)
    res.end(JSON.stringify({ id: 'saved', downloadUrl: '/api/fore-consult/sessions/s/documents/saved/download' }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const context = { apiBase: `http://127.0.0.1:${(server.address() as { port: number }).port}`, session: 's', token: 'signed' }
    const document = { format: 'xlsx', title: '库存', sheets: [{ name: '库存', columns: ['款号', '备注'],
      rows: Array.from({ length: 2218 }, () => ['001234567890123456789', '说明'.repeat(80)]) }] }
    const result = await callConsultDocumentTool('generate_consult_document', document, context)
    assert.equal(result.isError, undefined)
    assert.ok(received.length > 300000)
    assert.deepEqual(JSON.parse(received), document)
    assert.equal(token, 'signed')
    const schema = consultDocumentTool.inputSchema.properties as {
      sheets: { items: { properties: { rows: { maxItems: number } } } }
    }
    assert.equal(schema.sheets.items.properties.rows.maxItems, 5000)
    const oversized = await callConsultDocumentTool('generate_consult_document', { format: 'xlsx', title: 'x'.repeat(1000001) }, context)
    assert.equal(oversized.isError, true)
    const word = await callConsultDocumentTool('generate_consult_document', { format: 'docx', title: 'x'.repeat(300001) }, context)
    assert.equal(word.isError, true)
    assert.equal(calls, 1)
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
})
