import { execFile } from 'node:child_process'
import { realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export const consultGitHistoryTool = {
  name: 'source_git_history',
  description: '定位并读取相关源码后，查询该文件本地 HEAD 的最近提交（含重命名）或指定行归属，以帮助运维寻找联系线索。作者、提交者和最近修改者不等于主要开发者或故障责任人。不联网，不提供任意 Git 命令。',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '已定位的源码文件，相对当前系统源码根目录' },
      action: { type: 'string', enum: ['log', 'blame'], description: 'log 查询最近提交；blame 查询 HEAD 版本指定行的归属，默认 log' },
      maxCount: { type: 'integer', minimum: 1, maximum: 20 },
      startLine: { type: 'integer', minimum: 1 },
      endLine: { type: 'integer', minimum: 1, description: 'blame 单次最多 200 行；行号以 HEAD 版本为准' },
    },
    required: ['path'], additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}

function within(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`参数必须是 ${min} 至 ${max} 的整数`)
  }
  return value
}

/** 固定 Git 子命令和本地 HEAD；不接受模型提供的选项、引用或仓库目录。 */
export async function queryConsultGitHistory(sourceRoot: string, args: Record<string, unknown>): Promise<unknown> {
  const requested = typeof args.path === 'string' ? args.path.trim() : ''
  if (!requested || isAbsolute(requested) || requested.includes('\0')) throw new Error('必须提供源码相对文件路径')
  const root = realpathSync(sourceRoot)
  const lexical = resolve(root, requested)
  if (!within(root, lexical)) throw new Error('Git 查询路径超出当前系统源码目录')
  const file = realpathSync(lexical)
  if (!within(root, file) || !statSync(file).isFile()) throw new Error('Git 查询必须是授权目录内的文件')
  const path = relative(root, file).replace(/\\/g, '/')
  if (path.split('/').some(part => ['.git', 'graphify-out', 'node_modules', '.cache'].includes(part.toLowerCase()))) {
    throw new Error('不允许查询 Git 内部文件、图谱或依赖缓存')
  }
  const action = args.action ?? 'log'
  if (action !== 'log' && action !== 'blame') throw new Error('仅支持 log 或 blame')
  const maxCount = integer(args.maxCount, 10, 1, 20)
  const start = integer(args.startLine, 1, 1, 1_000_000)
  const end = integer(args.endLine, start + 49, start, Math.min(start + 199, 1_000_199))
  const deadline = Date.now() + 10_000
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')))
  Object.assign(env, { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1',
    GIT_NO_REPLACE_OBJECTS: '1', GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' })
  const git = (command: string[]): Promise<string> => new Promise((done, reject) => {
    const timeout = deadline - Date.now()
    if (timeout <= 0) { reject(new Error('Git 历史查询超时，请缩小范围')); return }
    execFile('git', ['--no-pager', '--literal-pathspecs', '-c', 'core.fsmonitor=false',
      '-c', 'maintenance.auto=0', '-c', 'gc.auto=0', ...command],
    { cwd: root, env, windowsHide: true, timeout, maxBuffer: 64 * 1024, encoding: 'utf8' }, (error, stdout) => {
      if (error) { reject(new Error('本地 Git 查询失败：仓库、提交或行范围不可用；不会自动拉取历史或改动仓库')); return }
      done(stdout)
    })
  })
  const repository = realpathSync((await git(['rev-parse', '--show-toplevel'])).trim())
  if (!within(root, repository)) throw new Error('Git 仓库根目录位于授权源码范围之外，拒绝向父仓库查询')
  const head = (await git(['rev-parse', '--verify', 'HEAD'])).trim()
  const shallow = (await git(['rev-parse', '--is-shallow-repository'])).trim() === 'true'
  const metadata = { path, head, shallow, scope: '当前本地 HEAD，不保证是远端最新或生产部署版本',
    attribution: '作者与提交者仅为联系线索；最近提交、行归属及提交数量不能证明主要开发者或故障责任',
    lineBasis: 'HEAD 版本；未提交的工作区改动不参与归属' }
  if (action === 'log') {
    const log = (await git(['log', `-n${maxCount}`, '--follow', '--no-show-signature', '--no-notes',
      '--format=%H%x00%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI%x00%s', head, '--', path])).trimEnd()
    const commits = log ? log.split('\n').map(line => {
      const [hash, author, authorEmail, authoredAt, committer, committerEmail, committedAt, subject] = line.split('\0')
      return { hash, author, authorEmail, authoredAt, committer, committerEmail, committedAt, subject }
    }) : []
    return { ...metadata, action, maxCount, commits, note: '最近提交范围有限；空结果可能是未跟踪文件或本地历史缺失' }
  }
  const blame = await git(['blame', '--line-porcelain', '--no-textconv', '--encoding=UTF-8',
    '-L', `${start},${end}`, head, '--', path])
  const lines: Array<Record<string, string | number>> = []
  let current: Record<string, string | number> = {}
  for (const line of blame.split('\n')) {
    const header = /^([0-9a-f]{40,64}) (\d+) (\d+)(?: \d+)?$/.exec(line)
    if (header) current = { hash: header[1], originalLine: Number(header[2]), line: Number(header[3]) }
    else if (line.startsWith('\t')) lines.push(current)
    else {
      const field = /^(author|author-mail|author-time|author-tz|committer|committer-mail|committer-time|committer-tz|summary) (.*)$/.exec(line)
      if (field) current[field[1]] = field[2]
    }
  }
  return { ...metadata, action, startLine: start, endLine: end, lines }
}
