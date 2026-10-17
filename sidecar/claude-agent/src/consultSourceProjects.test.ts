import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import { sourceRouting, type SourceRouting } from './consultSourceProjects.js'

test('automatic MCP scope reads multiple real roots, preserves provenance and never falls back after rejection', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'consult-sources-'))
  const a = join(directory, 'frontend'); const b = join(directory, 'backend')
  for (const root of [a, b]) { mkdirSync(join(root, 'src'), { recursive: true }) }
  writeFileSync(join(a, 'src/same.ts'), 'frontend marker')
  writeFileSync(join(b, 'src/same.ts'), 'backend marker')
  let scope: SourceRouting = { automatic: true, focusedProject: null,
    projects: [{ id: 'front', name: 'web', label: '小程序', path: a }, { id: 'back', name: 'api', label: '服务端', path: b }] }
  let unavailable = false
  let selection: unknown
  const server = createServer(async (req, res) => {
    assert.equal(req.headers['x-consult-resource-token'], 'trusted-scope-token')
    if (unavailable) { res.writeHead(503).end(); return }
    if (req.method === 'POST') {
      let body = ''; for await (const chunk of req) body += String(chunk)
      selection = JSON.parse(body)
      scope = { ...scope, focusedProject: 'back', reason: '页面请求映射到服务端', selectedBy: 'MODEL_INFERRED' }
    }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(scope))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  const child = spawn(process.execPath, [fileURLToPath(new URL('./readonlyMcp.js', import.meta.url))], {
    windowsHide: true, env: { ...process.env, TOOLBOX_API_BASE: `http://127.0.0.1:${address.port}`,
      TOOLBOX_SOURCE_ROOT: a, TOOLBOX_SESSION_ID: 'runtime', CONSULT_RESOURCE_TOKEN: 'trusted-scope-token',
      CONSULT_ENABLED_TOOLS: '["source_projects","source_read","source_search","source_context"]' }, stdio: ['pipe', 'pipe', 'pipe'],
  })
  const exited = new Promise<void>(resolve => child.once('close', () => resolve()))
  const lines = createInterface({ input: child.stdout })
  const pending = new Map<number, (value: any) => void>()
  lines.on('line', line => { const value = JSON.parse(line); pending.get(value.id)?.(value.result) })
  let id = 0
  const request = (name: string, args: unknown): Promise<any> => new Promise((resolve, reject) => {
    const key = ++id
    const timer = setTimeout(() => { pending.delete(key); reject(new Error('MCP scope timeout')) }, 15_000)
    pending.set(key, value => { clearTimeout(timer); pending.delete(key); resolve(value) })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: key, method: 'tools/call', params: { name, arguments: args } }) + '\n')
  })
  const text = (result: any) => result.content.map((item: any) => item.text).join('\n') as string
  try {
    const roster = await request('source_projects', {})
    const publicScope = JSON.parse(text(roster))
    assert.deepEqual(publicScope.projects.map((p: any) => p.id), ['front', 'back'])
    assert.equal(publicScope.projects[0].path, undefined)
    const noProject = await request('source_read', { path: 'src/same.ts' })
    assert.equal(noProject.isError, true)
    const [front, back] = await Promise.all([
      request('source_read', { project: 'front', path: 'src/same.ts' }),
      request('source_read', { project: 'back', path: 'src/same.ts' }),
    ])
    assert.match(text(front), /来源项目：小程序/); assert.match(text(front), /frontend marker/)
    assert.doesNotMatch(text(front), /backend marker/)
    assert.match(text(back), /来源项目：服务端/); assert.match(text(back), /backend marker/)
    assert.doesNotMatch(text(back), /frontend marker/)
    const structure = await request('source_context', { project: 'front', question: '截图中的页面' })
    assert.match(text(structure), /有界结构线索/)
    assert.match(text(structure), /src\//)
    const wrong = await request('source_read', { project: 'unregistered', path: 'src/same.ts' })
    assert.equal(wrong.isError, true)
    const escaped = await request('source_read', { project: 'front', path: '../backend/src/same.ts' })
    assert.equal(escaped.isError, true)
    const search = await request('source_search', { project: 'back', path: 'src', query: 'backend marker' })
    assert.match(text(search), /backend marker/)
    await request('source_projects', { action: 'select', project: 'back', evidencePath: 'src/same.ts', reason: '页面请求映射到服务端' })
    assert.deepEqual(selection, { project: 'back', evidencePath: 'src/same.ts', reason: '页面请求映射到服务端' })
    assert.match(text(await request('source_read', { path: 'src/same.ts' })), /backend marker/)
    scope = { ...scope, projects: [scope.projects[0]], focusedProject: null }
    assert.equal((await request('source_read', { project: 'back', path: 'src/same.ts' })).isError, true)
    unavailable = true
    const unavailableRead = await request('source_read', { project: 'front', path: 'src/same.ts' })
    assert.equal(unavailableRead.isError, true)
    assert.doesNotMatch(text(unavailableRead), /frontend marker/)
  } finally {
    child.kill(); lines.close(); await exited
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
})

test('missing trusted context preserves legacy scope and rejects metadata selection', async () => {
  assert.equal(await sourceRouting({ apiBase: '' }), null)
  await assert.rejects(sourceRouting({ apiBase: '' }, { project: 'untrusted' }), /可信/)
})
