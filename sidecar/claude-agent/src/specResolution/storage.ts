import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { requireCondition, type Context } from './contracts.js'

export const hash = (value: string) => createHash('sha256').update(value).digest('hex')
export const normalize = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim()
export function safePath(root: string, relative: string): string {
  requireCondition(!path.isAbsolute(relative) && !relative.split(/[\\/]/).includes('..'), 'PATH_INVALID', '路径必须位于项目内')
  const target = path.resolve(root, relative)
  requireCondition(target === root || target.startsWith(root + path.sep), 'PATH_INVALID', '路径越界')
  let cursor = root
  for (const part of path.relative(root, target).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part)
    if (fs.existsSync(cursor)) requireCondition(!fs.lstatSync(cursor).isSymbolicLink(), 'PATH_INVALID', '不支持符号链接路径')
  }
  return target
}
export function readText(file: string, max = 4 * 1024 * 1024): string {
  requireCondition(fs.statSync(file).size <= max, 'INPUT_LIMIT', `文件过大：${path.basename(file)}`)
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
}
export function readJson<T>(file: string): T { return JSON.parse(readText(file)) as T }
export function projectContext(input: Context) {
  const root = fs.realpathSync(input.project)
  requireCondition(input.changeId !== 'archive', 'CHANGE_CONTEXT_MISMATCH', 'archive 不是活动 change')
  requireCondition(fs.existsSync(safePath(root, 'openspec/config.yaml')), 'OPENSPEC_MISSING', '项目未启用 OpenSpec')
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', timeout: 5000, windowsHide: true }).trim() || 'DETACHED'
  requireCondition(!input.branch || input.branch === branch, 'CHANGE_CONTEXT_MISMATCH', '分支与请求不一致')
  requireCondition(fs.existsSync(safePath(root, `openspec/changes/${input.changeId}`)), 'CHANGE_CONTEXT_MISMATCH', '活动 change 不存在；先使用 OpenSpec 创建')
  return { root, branch }
}
export function statePath(root: string, name: string): string { return safePath(root, `.forge/spec-resolution/${name}.json`) }
export function saveJson(file: string, value: unknown) {
  const serialized = JSON.stringify(value, null, 2)
  requireCondition(Buffer.byteLength(serialized) <= 4 * 1024 * 1024, 'INPUT_LIMIT', '解析记录超过 4 MiB；缩小批次或规格区块后重试')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${randomUUID()}.tmp`
  try { fs.writeFileSync(temp, serialized, { flag: 'wx' }); fs.renameSync(temp, file) }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
}
export function locked<T>(root: string, action: () => T): T {
  const file = safePath(root, '.forge/spec-resolution/write.lock')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  let descriptor: number
  try { descriptor = fs.openSync(file, 'wx') }
  catch { throw new Error('SPEC_STORE_BUSY: 解析记录正在写入；确认无活动进程后处理遗留锁') }
  try { return action() } finally { fs.closeSync(descriptor); fs.unlinkSync(file) }
}
export function folders(root: string, relative: string): string[] {
  const directory = safePath(root, relative)
  if (!fs.existsSync(directory)) return []
  const entries = fs.readdirSync(directory, { withFileTypes: true })
  requireCondition(entries.length <= 2000, 'INPUT_LIMIT', '目录超出索引上限')
  requireCondition(!entries.some(entry => entry.isSymbolicLink()), 'PATH_INVALID', '索引目录不能包含符号链接')
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
}
