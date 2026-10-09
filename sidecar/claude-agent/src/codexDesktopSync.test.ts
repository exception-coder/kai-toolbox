import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readCodexDesktopPage } from './codexDesktopSync.js'

const nativeThread = {
  id: 'native-id', name: '真实标题', preview: 'preview', cwd: 'D:\\work\\repo', projectId: 'project-1',
  model: 'model-a', reasoningEffort: 'high', createdAt: 1000, updatedAt: 2000, source: 'appServer',
}
test('native projects preserve IDs, empty projects, roots, cursor and selected home', async () => {
  const calls: unknown[] = []
  const page = await readCodexDesktopPage('home-a', 'projects', 'cursor-1', undefined, async (...args) => {
    calls.push(args)
    return { data: [{ id: 'p1', name: '主项目', roots: [{ path: 'D:\\work' }] }, { id: 'p2', name: '空项目', roots: [] }], nextCursor: 'cursor-2' }
  })
  assert.deepEqual(calls, [['project/list', { limit: 50, cursor: 'cursor-1' }, 'home-a']])
  assert.deepEqual(page.data, [{ id: 'p1', name: '主项目', roots: ['D:\\work'] }, { id: 'p2', name: '空项目', roots: [] }])
  assert.equal(page.nextCursor, 'cursor-2')
})
test('thread page includes App Server sources without loading history or resuming a turn', async () => {
  const calls: Array<[string, Record<string, unknown>, string | undefined]> = []
  const page = await readCodexDesktopPage('home-b', 'threads', undefined, 'project-1', async (method, params, home) => {
    calls.push([method, params, home])
    return method === 'thread/list'
      ? { data: [nativeThread, { ...nativeThread, ephemeral: true }], nextCursor: null }
      : { project: { id: 'project-1', name: '真实项目', roots: [{ path: nativeThread.cwd }] } }
  })
  assert.deepEqual(calls.map(call => call[0]), ['thread/list', 'project/read'])
  assert.equal(calls.every(call => call[2] === 'home-b'), true)
  assert.deepEqual(calls[0][1], { limit: 50, sortKey: 'updated_at', sourceKinds: ['cli', 'vscode', 'appServer'], archived: false, projectId: 'project-1' })
  assert.equal(page.data.length, 1)
  assert.equal(page.project?.name, '真实项目')
  assert.equal((page.data[0] as { updatedAt: number }).updatedAt, 2_000_000)
})
test('different homes stay attached to their own requests', async () => {
  const request = async (_method: string, _params: Record<string, unknown>, home?: string) => ({
    data: [{ ...nativeThread, name: home }], nextCursor: null,
  })
  const [a, b] = await Promise.all([
    readCodexDesktopPage('a', 'threads', undefined, undefined, request),
    readCodexDesktopPage('b', 'threads', undefined, undefined, request),
  ])
  assert.equal((a.data[0] as { title: string }).title, 'a')
  assert.equal((b.data[0] as { title: string }).title, 'b')
})
test('unsupported projects and malformed pagination are explicit failures', async () => {
  await assert.rejects(readCodexDesktopPage('home', 'projects', undefined, undefined, async () => { throw new Error('method not found') }), /method not found/)
  await assert.rejects(readCodexDesktopPage('home', 'threads', undefined, undefined, async () => ({ data: {}, nextCursor: null })), /分页/)
  await assert.rejects(readCodexDesktopPage('home', 'threads', undefined, undefined, async () => ({ data: [{ ...nativeThread, updatedAt: null }], nextCursor: null })), /更新时间/)
})
test('old unassigned threads use exact native roots and a separate cursor stream', async () => {
  const calls: Array<[string, Record<string, unknown>]> = []
  const request = async (method: string, params: Record<string, unknown>) => {
    calls.push([method, params])
    if (method === 'project/read') return { project: { id: 'project-1', name: '项目', roots: [{ path: nativeThread.cwd }] } }
    if (params.projectId === 'project-1') return { data: [], nextCursor: null }
    return { data: [{ ...nativeThread, projectId: null }], nextCursor: params.cursor ? null : 'old-next' }
  }
  const first = await readCodexDesktopPage('home', 'threads', undefined, 'project-1', request)
  assert.equal(first.projectMatch, 'directory')
  assert.equal(first.data.length, 1)
  assert.deepEqual(calls[2][1], {
    limit: 50, sortKey: 'updated_at', sourceKinds: ['cli', 'vscode', 'appServer'], archived: false,
    projectId: null, cwd: [nativeThread.cwd],
  })
  calls.length = 0
  const second = await readCodexDesktopPage('home', 'threads', first.nextCursor!, 'project-1', request)
  assert.equal(second.nextCursor, null)
  assert.deepEqual(calls.map(([method]) => method), ['project/read', 'thread/list'])
  assert.equal(calls[1][1].cursor, 'old-next')
})
test('directory matching cannot silently include another native project or unrelated cwd', async () => {
  await assert.rejects(readCodexDesktopPage('home', 'threads', undefined, 'project-1', async (method, params) => {
    if (method === 'project/read') return { project: { id: 'project-1', name: '项目', roots: [{ path: nativeThread.cwd }] } }
    return params.projectId ? { data: [], nextCursor: null } : { data: [nativeThread], nextCursor: null }
  }), /未按请求/)
  await assert.rejects(readCodexDesktopPage('home', 'threads', undefined, 'project-1', async (method) => {
    if (method === 'project/read') return { project: { id: 'project-1', name: '项目', roots: [] } }
    return { data: [{ ...nativeThread, projectId: 'another-project' }], nextCursor: null }
  }), /未按请求/)
  await assert.rejects(readCodexDesktopPage('home', 'threads', undefined, 'project-1', async (method) => {
    if (method === 'project/read') return { project: { id: 'another-project', name: '项目', roots: [] } }
    return { data: [], nextCursor: null }
  }), /其他项目/)
})
