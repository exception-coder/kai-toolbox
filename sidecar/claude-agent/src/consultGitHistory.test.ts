import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createInterface } from 'node:readline'
import { queryConsultGitHistory } from './consultGitHistory.js'
import { consultReadonlyCodexConfig, createClaudeConsultSourceServer } from './codexSecurity.js'
import { filterClaudeAssembly, filterCodexAssembly } from './consultToolAssembly.js'
import { Permissions } from './permissions.js'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'consult-git-'))
  const git = (...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=', ...args], {
    cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env,
      GIT_AUTHOR_NAME: 'Test Alice', GIT_AUTHOR_EMAIL: 'alice@example.test',
      GIT_COMMITTER_NAME: 'Test Integrator', GIT_COMMITTER_EMAIL: 'integrator@example.test' },
  }).trim()
  git('init', '--quiet')
  writeFileSync(join(root, 'original.ts'), 'one\ntwo\nthree\n')
  git('add', '--', 'original.ts'); git('commit', '--quiet', '-m', 'initial logic')
  git('mv', 'original.ts', 'page file.ts')
  writeFileSync(join(root, 'page file.ts'), 'one\nTWO\nthree\n')
  git('add', '--', 'page file.ts')
  git('commit', '--quiet', '--author=Test Bob <bob@example.test>', '-m', 'adjust date rule')
  return { root, git, close: () => rmSync(root, { recursive: true, force: true }) }
}

test('reads rename history and committed line attribution without changing worktree, index or HEAD', async () => {
  const f = fixture()
  try {
    writeFileSync(join(f.root, 'page file.ts'), 'uncommitted\nchanged two\nthree\n')
    const status = f.git('status', '--porcelain')
    const index = readFileSync(join(f.root, '.git/index'))
    const log = await queryConsultGitHistory(f.root, { path: 'page file.ts' }) as any
    assert.deepEqual(log.commits.map((c: any) => c.subject), ['adjust date rule', 'initial logic'])
    assert.equal(log.commits[0].author, 'Test Bob')
    assert.equal(log.commits[0].committer, 'Test Integrator')
    const blame = await queryConsultGitHistory(f.root, { path: 'page file.ts', action: 'blame', startLine: 1, endLine: 3 }) as any
    assert.equal(blame.lines.length, 3)
    assert.equal(blame.lines[0].hash, log.commits[1].hash)
    assert.equal(blame.lines[1].hash, log.commits[0].hash)
    assert.equal(log.head, f.git('rev-parse', 'HEAD'))
    assert.equal(f.git('status', '--porcelain'), status)
    assert.deepEqual(readFileSync(join(f.root, '.git/index')), index)
  } finally { f.close() }
})

test('rejects escaped paths, parent repositories, invalid actions and unbounded requests', async () => {
  const f = fixture()
  try {
    for (const args of [{ path: '../outside.ts' }, { path: '.git/config' },
      { path: 'page file.ts', action: 'pull' }, { path: 'page file.ts', maxCount: 21 },
      { path: 'page file.ts', action: 'blame', startLine: 1, endLine: 201 }]) {
      await assert.rejects(queryConsultGitHistory(f.root, args))
    }
    mkdirSync(join(f.root, 'child'))
    writeFileSync(join(f.root, 'child/file.ts'), 'child')
    await assert.rejects(queryConsultGitHistory(join(f.root, 'child'), { path: 'file.ts' }), /父仓库/)
    const outside = mkdtempSync(join(tmpdir(), 'consult-git-outside-'))
    try {
      writeFileSync(join(outside, 'secret.ts'), 'outside')
      symlinkSync(outside, join(f.root, 'link'), process.platform === 'win32' ? 'junction' : 'dir')
      await assert.rejects(queryConsultGitHistory(f.root, { path: 'link/secret.ts' }), /授权目录/)
    } finally { rmSync(outside, { recursive: true, force: true }) }
    writeFileSync(join(f.root, 'untracked.ts'), 'no history')
    const empty = await queryConsultGitHistory(f.root, { path: 'untracked.ts' }) as any
    assert.deepEqual(empty.commits, [])
  } finally { f.close() }
})

test('marks shallow local history and does not fetch missing commits', async () => {
  const f = fixture()
  const container = mkdtempSync(join(tmpdir(), 'consult-git-clone-'))
  try {
    const clone = join(container, 'repo')
    execFileSync('git', ['clone', '--quiet', '--depth=1', pathToFileURL(f.root).href, clone], { windowsHide: true })
    const log = await queryConsultGitHistory(clone, { path: 'page file.ts' }) as any
    assert.equal(log.shallow, true)
    assert.equal(log.commits.length, 1)
  } finally { rmSync(container, { recursive: true, force: true }); f.close() }
})

test('both engine assemblies allow bound history while denying shell and unbound Git tools', async () => {
  const f = fixture()
  try {
    const assembly = { tools: ['source_git_history'], mcpServers: ['consult-readonly'] }
    const codex = filterCodexAssembly(consultReadonlyCodexConfig(undefined, undefined, f.root), assembly) as any
    assert.deepEqual(codex.mcp_servers['consult-readonly'].enabled_tools, ['source_git_history'])
    const claude: Record<string, any> = { 'consult-readonly': createClaudeConsultSourceServer(f.root) }
    filterClaudeAssembly(claude, assembly)
    assert.equal(claude['consult-readonly'].env.CONSULT_ENABLED_TOOLS, '["source_git_history"]')
    const broker = new Permissions(() => {})
    broker.setToolPolicy('consult-readonly'); broker.consultToolAssembly = assembly
    assert.equal((await broker.canUseTool('mcp__consult-readonly__source_git_history', {}, {})).behavior, 'allow')
    for (const tool of ['Bash', 'exec_command', 'mcp__git__commit']) {
      assert.equal((await broker.canUseTool(tool, {}, {})).behavior, 'deny')
    }
    broker.consultToolAssembly = { tools: ['source_read'], mcpServers: ['consult-readonly'] }
    assert.equal((await broker.canUseTool('mcp__consult-readonly__source_git_history', {}, {})).behavior, 'deny')
  } finally { f.close() }
})

test('MCP publishes and executes only the configured history capability', async () => {
  const f = fixture()
  const child = spawn(process.execPath, [fileURLToPath(new URL('./readonlyMcp.js', import.meta.url))], {
    windowsHide: true, env: { ...process.env, TOOLBOX_SOURCE_ROOT: f.root,
      CONSULT_ENABLED_TOOLS: '["source_git_history"]' }, stdio: ['pipe', 'pipe', 'pipe'],
  })
  const exited = new Promise<void>(resolve => child.once('close', () => resolve()))
  const lines = createInterface({ input: child.stdout })
  const pending = new Map<number, (value: any) => void>()
  lines.on('line', line => { const value = JSON.parse(line); pending.get(value.id)?.(value.result) })
  let id = 0
  const request = (method: string, params: unknown): Promise<any> => new Promise((resolve, reject) => {
    const key = ++id
    const timer = setTimeout(() => { pending.delete(key); reject(new Error('MCP timeout')) }, 15_000)
    pending.set(key, value => { clearTimeout(timer); pending.delete(key); resolve(value) })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: key, method, params }) + '\n')
  })
  try {
    const list = await request('tools/list', {})
    assert.deepEqual(list.tools.map((tool: any) => tool.name), ['source_git_history'])
    const result = await request('tools/call', { name: 'source_git_history', arguments: { path: 'page file.ts', maxCount: 1 } })
    assert.equal(JSON.parse(result.content[0].text).commits.length, 1)
    const denied = await request('tools/call', { name: 'source_read', arguments: { path: 'page file.ts' } })
    assert.equal(denied.isError, true)
  } finally { child.kill(); lines.close(); await exited; f.close() }
})
