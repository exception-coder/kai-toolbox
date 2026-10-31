/** 可独立复制的测试整理执行器：读取目标仓库配置，在隔离分支形成候选，不自动合入或安装定时任务。 */
import { execFileSync, spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, matchesGlob, relative, resolve } from 'node:path'

const rootArgument = process.argv.indexOf('--root')
const directory = resolve(rootArgument < 0 ? process.cwd() : process.argv[rootArgument + 1] || process.cwd())
const root = execFileSync('git', ['-C', directory, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
if (rootArgument >= 0 && relative(directory, root)) throw new Error('指定的项目目录不是 Git 仓库根；不能沿用父仓库范围，请先核对目标仓库')
const configFile = join(root, 'test-maintenance.config.json')
const config = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : {}
const defaultPatterns = ['**/src/test/**', '**/__tests__/**', '**/*.test.*', '**/*.spec.*', '**/test_*.py', '**/*_test.go']
const keys = ['baseRef', 'branch', 'budgetMinutes', 'testPatterns', 'watchPaths', 'publish', 'ignoreUserConfig']
if (!config || Array.isArray(config) || typeof config !== 'object' || Object.keys(config).some(key => !keys.includes(key))) throw new Error('测试整理配置包含未知字段，见本地 Skill')
const patterns = config.testPatterns ?? defaultPatterns
const watchPaths = config.watchPaths ?? []
for (const [name, values] of [['testPatterns', patterns], ['watchPaths', watchPaths]]) {
  if (!Array.isArray(values) || (name === 'testPatterns' && !values.length)
    || values.some(value => typeof value !== 'string' || !value || /^[/-]/.test(value) || value.includes(':') || value.includes('\\') || value.split('/').includes('..')
      || (name === 'testPatterns' && ['*', '**', '**/*'].includes(value)))) throw new Error(`${name} 必须是非越界的仓库相对路径或模式`)
}
for (const field of ['publish', 'ignoreUserConfig']) if (config[field] !== undefined && typeof config[field] !== 'boolean') throw new Error(`${field} 必须是布尔值`)
const minutes = config.budgetMinutes ?? 15
if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) throw new Error('budgetMinutes 必须为 1 到 60 的整数')
const branch = config.branch ?? 'maintenance/test-assets'
if (typeof branch !== 'string' || branch.startsWith('-')) throw new Error('候选分支无效')
git(['check-ref-format', '--branch', branch])
const stateDirectory = resolve(root, git(['rev-parse', '--git-common-dir']), 'tac')
const worktree = join(stateDirectory, 'w')
const stateFile = join(stateDirectory, 'latest.json')
const ownerFile = join(stateDirectory, 'owner.json')
const durationMs = minutes * 60 * 1000
const testPath = file => !file.includes('\\') && !file.split('/').includes('..') && patterns.some(pattern => matchesGlob(file, pattern))
const policy = createHash('sha256').update(JSON.stringify({ config, patterns })).update(readFileSync(new URL('../SKILL.md', import.meta.url))).update(readFileSync(new URL(import.meta.url))).digest('hex')
const upstream = config.baseRef ?? configuredUpstream()
if (typeof upstream !== 'string' || !upstream || upstream.startsWith('-') || /\s/.test(upstream)) throw new Error('baseRef 无效')
const remote = git(['remote']).split('\n').sort((a, b) => b.length - a.length).find(name => name && upstream.startsWith(`${name}/`))
if (upstream === branch || upstream === `${remote}/${branch}`) throw new Error('基线不能是候选分支')

function configuredUpstream() {
  try { return git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']) } catch (error) {
    if (error.status !== 128) throw error
    return git(['symbolic-ref', '--short', 'HEAD'])
  }
}

function git(args, cwd = root, input) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', input, timeout: 60_000, maxBuffer: 4 * 1024 * 1024 }).trim()
}

function save(state) {
  writeFileSync(stateFile, JSON.stringify({ time: new Date().toISOString(), policy, ...state }, null, 2) + '\n')
  console.log(JSON.stringify(state))
}

function blocked(message, verification) {
  const error = new Error(message)
  error.code = 'MAINTENANCE_BLOCKED'
  error.verification = verification
  return error
}

function refExists(ref) {
  try { git(['show-ref', '--verify', '--quiet', ref]); return true } catch (error) {
    if (error.status === 1) return false
    throw error
  }
}

function merged() {
  try { git(['merge-base', '--is-ancestor', branch, upstream]); return true } catch (error) {
    if (error.status === 1) return false
    throw error
  }
}

// 只移除本入口创建且干净的工作树；有未提交或未知文件时让 Git 拒绝，保留失败现场。
function retireWorktree() {
  if (existsSync(worktree)) git(['worktree', 'remove', worktree])
  git(['branch', '-d', branch])
}

function codexCommand() {
  const entry = process.env.TEST_MAINTENANCE_CODEX_CLI || process.env.YOOONI_CODEX_CLI
  const npmEntry = process.platform === 'win32' && process.env.APPDATA ? join(process.env.APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js') : null
  if (entry || npmEntry && existsSync(npmEntry)) {
    const file = resolve(entry || npmEntry)
    if (!existsSync(file) || !/\.[cm]?js$/.test(file)) throw new Error('CLI 覆盖值须指向已安装的 bin/codex.js')
    return { file: process.execPath, args: [file] }
  }
  return { file: 'codex', args: [] }
}

async function runCodex(cli, prompt, log, result, schema) {
  const fd = openSync(log, 'w')
  const child = spawn(cli.file, [...cli.args, 'exec', ...(config.ignoreUserConfig ? ['--ignore-user-config'] : []), '--ephemeral',
    '-s', 'workspace-write', '-c', 'approval_policy="never"', '--color', 'never',
    '--output-schema', schema, '--output-last-message', result, '-'], {
    cwd: worktree, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', fd, fd],
  })
  closeSync(fd)
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    if (process.platform === 'win32' && child.pid) {
      try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }) } catch { child.kill() }
    } else {
      try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill('SIGTERM') }
    }
  }, durationMs)
  try {
    await new Promise((accept, reject) => {
      child.once('error', reject)
      child.once('exit', code => code === 0 && !timedOut ? accept() : reject(new Error(timedOut ? '后台预算已用完，保留现场' : `Codex 退出码 ${code}，见 ${log}`)))
      child.stdin.on('error', reject)
      child.stdin.end(prompt)
    })
  } finally { clearTimeout(timer) }
}

async function main() {
  const previous = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {}
  if (!process.argv.includes('--run')) {
    console.log(JSON.stringify({ root, upstream, branch, worktree, minutes, testPatterns: patterns, publish: config.publish === true, previous }, null, 2))
    return
  }
  mkdirSync(stateDirectory, { recursive: true })
  const lockFile = join(stateDirectory, 'running.lock')
  let lock
  try { lock = openSync(lockFile, 'wx') } catch (error) {
    if (error.code !== 'EEXIST') throw error
    console.log('已有后台任务或中断现场，保留锁，不启动另一批。')
    return
  }
  writeFileSync(lock, `${process.pid}\n`)
  try { await runBatch(previous) } finally { closeSync(lock); unlinkSync(lockFile) }
}

async function runBatch(previous) {
  const cli = codexCommand()
  if (config.publish && !remote) throw blocked('发布候选需要项目已配置的远端基线，不能替项目猜测远端或分支')
  if (remote) git(['fetch', remote, upstream.slice(remote.length + 1)])
  const base = git(['rev-parse', '--verify', '--end-of-options', `${upstream}^{commit}`])
  if (refExists(`refs/heads/${branch}`)) {
    const owner = existsSync(ownerFile) ? JSON.parse(readFileSync(ownerFile, 'utf8')) : null
    if (owner?.branch !== branch || owner?.worktree !== worktree || !existsSync(worktree)
      || git(['branch', '--show-current'], worktree) !== branch) throw blocked('同名分支不属于本入口，保留原分支')
    if (!merged()) { save({ status: 'pending', base, summary: '已有候选待处理或失败现场，停止新一批', worktree, branch }); return }
    retireWorktree()
  }
  if (previous.scanned === base && previous.policy === policy && !process.argv.includes('--force')) {
    save({ ...previous, status: 'skipped', summary: '已审计相同输入，不重复执行' }); return
  }
  if (previous.scanned && previous.policy === policy && watchPaths.length && !process.argv.includes('--force')) {
    const changed = git(['diff', '--name-only', `${previous.scanned}..${base}`, '--', ...watchPaths])
    if (!changed) { save({ status: 'skipped', base, scanned: base, summary: '项目声明的关注范围未变化' }); return }
  }
  git(['worktree', 'add', '-b', branch, worktree, base])
  writeFileSync(ownerFile, JSON.stringify({ branch, worktree }))
  const result = join(stateDirectory, 'result.json')
  const schema = join(stateDirectory, 'result-schema.json')
  const log = join(stateDirectory, 'run.log')
  writeFileSync(schema, JSON.stringify({ type: 'object', additionalProperties: false,
    properties: { outcome: { type: 'string', enum: ['changed', 'no-change', 'blocked'] }, summary: { type: 'string' }, verification: { type: 'string' } },
    required: ['outcome', 'summary', 'verification'] }))
  writeFileSync(result, '')
  const prompt = `使用本项目 .agents/skills/workflow/test-asset-cleanup/SKILL.md，完成已授权的一批历史测试整理。
这是后台维护，不启动其他 Agent。读取 AGENTS、工程宪法和相关实现，先判断再复用。
目标仓库是 ${JSON.stringify(root)}，仅允许改动以下仓库相对测试模式：${JSON.stringify(patterns)}。依据本项目实际语言、模块、测试发现规则和已有命令选择一个有明确收益的小批，不要求中台目录、SDK、指定语言或全仓扫描。
不修改业务代码、规范、模板、构建配置和门禁；不部署、重启或访问数据库，不读取本机秘密配置或输出凭据。不能增加 skip/only、降低断言或用删除后全绿证明无价值。没有充分依据就保留。
复用夹具或参数化时保留各接口、权限拒绝、边界和历史故障的独立断言及状态隔离。优先原位整理；不要改动需要同步范围外引用的测试。
说明原资产到保留覆盖的对应，先取必要基线再定向验证，不跑全仓测试。只有相关断言、发现入口、必要状态隔离都已验证才返回 changed；失败不能伪报完成。
总预算${minutes}分钟，预留验证时间，只完成一个可独立交付的小批。不新增审计报告，不重新安装依赖或为删除数量凑成果；参数化、夹具和替换测试只承接本批已有风险，不复制多套测试。
本次由外层入口提交推送，覆盖项目默认自动提交约定：你不得 commit、push、切分支或改 Git 配置，保留工作区改动供外层核对。
最后按 schema 返回 outcome、中文 summary 和实际 verification（命令、结果、覆盖与剩余缺口）。仅在已确认无必要改动时返回 no-change；若必要命令被策略拒绝、工具缺失或基线无法取得，必须返回 blocked，不能算已审计完成。`
  await runCodex(cli, prompt, log, result, schema)
  if (git(['rev-parse', 'HEAD'], worktree) !== base || git(['branch', '--show-current'], worktree) !== branch) throw new Error('Agent 改变了提交或分支，保留现场')
  const response = JSON.parse(readFileSync(result, 'utf8'))
  // CLI 退出 0 只代表会话结束；实际降为只读时不能缓存为“无需清理”。
  if (/^sandbox:\s*read-only\s*$/m.test(readFileSync(log, 'utf8').slice(0, 4000))) {
    throw blocked('请求可写工作区但 CLI 实际以只读策略运行，未验收自动整理', response.verification)
  }
  if (response.outcome === 'blocked') throw blocked(response.summary, response.verification)
  const files = [...new Set([...git(['diff', '--no-renames', '--name-only', '-z', 'HEAD'], worktree).split('\0'), ...git(['ls-files', '-z', '--others', '--exclude-standard'], worktree).split('\0')].filter(Boolean))]
  if (!files.length && response.outcome === 'no-change') {
    retireWorktree(); save({ status: 'no-change', base, scanned: base, summary: response.summary, verification: response.verification }); return
  }
  if (response.outcome !== 'changed' || !files.length || !response.verification?.trim()) throw new Error('改动与验证结果不完整，保留现场')
  if (files.some(file => !testPath(file))) throw new Error('候选包含范围外改动，保留现场，不提交')
  git(['add', '--', ...files], worktree)
  const patch = git(['diff', '--cached', '--unified=0'], worktree)
  if (patch.split('\n').some(line => /^\+[^+]/.test(line) && /@Disabled|\.(?:skip|only)\s*\(/.test(line))) throw new Error('候选新增跳过或独占执行，保留现场')
  git(['diff', '--cached', '--check'], worktree)
  git(['commit', '-F', '-'], worktree, `test(maintenance): 整理重复测试资产\n\n【改动】${response.summary}\n\n【原因】后台按覆盖证据减少重复维护，不改变业务规则。\n\n【结果】${response.verification}\n`)
  if (config.publish) git(['push', remote, `HEAD:refs/heads/${branch}`], worktree)
  save({ status: 'candidate', base, scanned: base, commit: git(['rev-parse', 'HEAD'], worktree), branch, worktree, published: config.publish === true, ...response })
}

main().catch(error => {
  if (existsSync(stateDirectory)) save({ status: error.code === 'MAINTENANCE_BLOCKED' ? 'blocked' : 'failed', summary: error.message, verification: error.verification, worktree, branch })
  console.error(error.message)
  process.exitCode = 1
})
