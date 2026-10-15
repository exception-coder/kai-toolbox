import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

test('creative MCP evaluates code, forwards validated output and returns preview image without exposing credentials', async () => {
  const requests: { url: string; token: unknown; body: string }[] = []
  const id = 'a'.repeat(64)
  let previewFailure = false
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += String(chunk)
    requests.push({ url: req.url!, token: req.headers['x-consult-resource-token'], body })
    if (previewFailure && req.url!.includes('/preview')) { req.socket.destroy(); return }
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(req.url!.includes('/preview')
      ? { mimeType: 'image/png', imageBase64: 'aGVsbG8=', notes: ['结构预览'] }
      : { id, downloadUrl: '/download' }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const child = spawn(process.execPath, [fileURLToPath(new URL('./readonlyMcp.js', import.meta.url))], {
    windowsHide: true, env: { ...process.env, TOOLBOX_API_BASE: `http://127.0.0.1:${(server.address() as any).port}`,
      TOOLBOX_SESSION_ID: 'runtime-test', CONSULT_RESOURCE_TOKEN: 'trusted-token', CONSULT_DISABLE_LEGACY_DATABASES: 'true',
      CONSULT_ENABLED_TOOLS: JSON.stringify(['design_consult_document', 'preview_consult_document']) }, stdio: ['pipe', 'pipe', 'pipe'],
  })
  const replies = new Map<number, (value: any) => void>()
  const lines = createInterface({ input: child.stdout })
  lines.on('line', line => { const value = JSON.parse(line); replies.get(value.id)?.(value) })
  let nextId = 0
  const call = (name: string, args: object) => new Promise<any>((resolve, reject) => {
    const key = ++nextId; const timeout = setTimeout(() => reject(new Error('MCP timeout')), 15_000)
    replies.set(key, value => { clearTimeout(timeout); replies.delete(key); resolve(value.result) })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: key, method: 'tools/call', params: { name, arguments: args } }) + '\n')
  })
  try {
    const result = await call('design_consult_document', {
      script: "return {format:'xlsx',title:'统计',sheets:[{name:'金额',columns:['合计'],rows:[[data.values.reduce((a,b)=>a+b,0)]]}]}",
      data: { values: [10, 20] },
    })
    assert.equal(result.content[2].type, 'image')
    assert.equal(requests.length, 2)
    assert.equal(requests[0].token, 'trusted-token')
    assert.equal(JSON.parse(requests[0].body).sheets[0].rows[0][0], 30)
    assert.equal(requests[0].body.includes('script'), false)
    assert.match(requests[1].url, /runtime-test\/documents\/[a-f0-9]+\/preview\?page=1$/)
    const denied = await call('design_consult_document', { script: 'return process.env' })
    assert.equal(denied.isError, true)
    assert.equal(requests.length, 2)
    const invalid = await call('preview_consult_document', { documentId: '../../secret' })
    assert.equal(invalid.isError, true)
    assert.equal(requests.length, 2)
    previewFailure = true
    const partial = await call('design_consult_document', { script: "return {format:'docx',title:'说明',sections:[{paragraphs:['正文']}]}" })
    assert.equal(partial.previewError, true)
    assert.match(partial.content[0].text, /downloadUrl/)
    assert.match(partial.content[1].text, /文件已保存/)
  } finally {
    child.kill(); lines.close(); await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
