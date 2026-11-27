// Usage: set FORGE_CLIENT_ID, FORGE_CLIENT_SECRET and FORGE_TENANT_ID, then
// node scripts/test-consult-backend.mjs [--analyze]
// FORGE_BASE_URL defaults to the requested LAN endpoint. Secrets stay in memory.
import { randomUUID } from 'node:crypto'

async function main() {
  const base = new URL(process.env.FORGE_BASE_URL || 'http://192.168.8.219:18080')
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password
      || base.pathname !== '/' || base.search || base.hash) throw new Error('Invalid FORGE_BASE_URL')
  const required = name => {
    if (!process.env[name]?.trim()) throw new Error(`Missing ${name}`)
    return process.env[name].trim()
  }
  const clientId = required('FORGE_CLIENT_ID')
  const secret = required('FORGE_CLIENT_SECRET')
  const tenantId = required('FORGE_TENANT_ID')
  const request = async (path, options) => {
    let response
    try {
      response = await fetch(new URL(`/api/fore-consult/v1/${path}`, base), {
        ...options, redirect: 'error', signal: AbortSignal.timeout(150000),
      })
    } catch (error) {
      const code = error.cause?.code || error.name
      throw new Error(`Request failed at ${base.origin}: ${code}`)
    }
    let body
    try { body = await response.json() } catch { throw new Error(`HTTP ${response.status}: expected JSON`) }
    console.log(JSON.stringify({ endpoint: path.split('?')[0], status: response.status }))
    return { response, body }
  }
  console.log(JSON.stringify({ baseUrl: base.origin, tenantId }))
  const token = await request('token', {
    method: 'POST', headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    }, body: 'grant_type=client_credentials',
  })
  if (token.response.status !== 200 || !token.body.access_token || token.body.token_type?.toLowerCase() !== 'bearer') {
    throw new Error('Token exchange failed')
  }
  const headers = { Authorization: `Bearer ${token.body.access_token}` }
  const lookup = await request(`analysis-tasks?requestId=smoke_${randomUUID()}`, { headers })
  if (lookup.response.status !== 404 || lookup.body.code !== 'TASK_NOT_FOUND') {
    throw new Error('Authenticated lookup did not return expected NOT_FOUND')
  }
  if (process.argv.includes('--analyze')) {
    const id = `smoke_${randomUUID()}`
    console.log(JSON.stringify({ requestId: id }))
    const result = await request('analyze-once', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'it-support-partner', tenantId, problemId: id,
        conversationId: id, requestId: id, title: '接口连通性测试',
        description: '这是授权的接口冒烟测试。请简短回复接口测试已收到，无需查询系统、执行操作或修改数据。',
        systemIds: [], replyMode: 'FORGE_FLEX' }),
    })
    if (result.response.status !== 200 || result.body.requestId !== id || !result.body.result) throw new Error('Analysis failed')
    console.log(JSON.stringify({ analysisResult: result.body }))
  }
  console.log('PASS')
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
