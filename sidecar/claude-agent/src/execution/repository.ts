import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { requireCondition } from '../specResolution/contracts.js'
import { hash, safePath } from '../specResolution/storage.js'

export function git(root: string, args: string[]) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 4 * 1024 * 1024 }).trim()
}
export function projectContext(project: string, requireBranch = true) {
  const root = fs.realpathSync(project)
  requireCondition(fs.realpathSync(git(root, ['rev-parse', '--show-toplevel'])) === root, 'PROJECT_ROOT_REQUIRED', '传入 Git 工作区根目录')
  const branch = git(root, ['branch', '--show-current'])
  requireCondition(branch || !requireBranch, 'BRANCH_REQUIRED', '先由宿主分配工作分支；不在 detached HEAD 上自动创建分支')
  return { root, branch }
}
export function fileDigest(root: string, relative: string) {
  const file = safePath(root, relative)
  if (!fs.existsSync(file)) return 'MISSING'
  requireCondition(fs.statSync(file).isFile() && fs.statSync(file).size <= 4 * 1024 * 1024, 'INPUT_LIMIT', '证据必须是最多4MiB的普通文件')
  return hash(fs.readFileSync(file).toString('base64'))
}
export function inputFingerprint(root: string, files: string[]) {
  return hash(JSON.stringify([...new Set(files)].sort().map(file => [file, fileDigest(root, file)])))
}
