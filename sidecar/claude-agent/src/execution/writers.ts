import fs from 'node:fs'
import path from 'node:path'
import { identifier, requireCondition } from '../specResolution/contracts.js'
import { hash, readJson, safePath, saveJson, statePath } from '../specResolution/storage.js'
import type { Execution } from './service.js'

export type Writer = { sessionId: string; executionId: string; scopes: string[] }
const legacyFile = (root: string) => statePath(root, 'execution-writer')
const writersFile = (root: string) => statePath(root, 'execution-writers')

const moduleFiles = ['pom.xml', 'package.json', 'build.gradle', 'build.gradle.kts', 'go.mod']
const sharedBuildFiles = new Set([...moduleFiles, 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
  'vite.config.ts', 'vite.config.js', 'tsconfig.json', 'settings.gradle', 'settings.gradle.kts'])
const domainFolders = new Set(['features', 'domains', 'modules'])

function enclosingModule(root: string, parts: string[]): string {
  for (let end = parts.length - 1; end > 0; end--) {
    const candidate = parts.slice(0, end).join('/')
    if (moduleFiles.some(name => fs.existsSync(safePath(root, `${candidate}/${name}`)))) return candidate
  }
  return ''
}

/** Claims follow explicit module and feature directories; only repository-wide files use the global scope. */
export function executionScopes(root: string, files: string[]): string[] {
  const scopes = new Set<string>()
  for (const file of files) {
    const normalized = path.relative(root, safePath(root, file)).replaceAll('\\', '/')
    const parts = normalized.split('/')
    if ((parts.length === 1 && sharedBuildFiles.has(normalized))
      || /^(?:db|database|migrations?|schema)(?:\/|$)/i.test(normalized)) {
      scopes.add('*')
      continue
    }
    if (parts[0] === 'docs') {
      scopes.add(`file:${normalized}`)
      continue
    }
    if (parts[0] === 'openspec') {
      if (parts[1] === 'changes' && parts[2]) scopes.add(`change:${parts[2]}`)
      else if (parts[1] === 'specs' && parts[2]) scopes.add(`spec:${parts[2]}`)
      else scopes.add(`file:${normalized}`)
      continue
    }
    const module = enclosingModule(root, parts)
    if (!module) {
      scopes.add(`file:${normalized}`)
      continue
    }
    const moduleParts = module.split('/')
    const domainIndex = parts.findIndex((part, index) => index >= moduleParts.length
      && domainFolders.has(part) && index + 1 < parts.length - 1)
    if (domainIndex >= 0) {
      scopes.add(`module:${parts.slice(0, domainIndex + 2).join('/')}`)
    } else if ((module === 'frontend' || module === 'sidecar/claude-agent') && !sharedBuildFiles.has(parts.at(-1) || '')
      && !parts.some(part => /^(?:db|database|migrations?|schema)$/i.test(part))) {
      scopes.add(`file:${normalized}`)
    } else {
      scopes.add(`module:${module}`)
    }
  }
  return [...scopes].sort()
}

export function readWriters(root: string): Writer[] {
  const legacy = legacyFile(root)
  const current = writersFile(root)
  const writers = fs.existsSync(current) ? readJson<Writer[]>(current) : []
  requireCondition(Array.isArray(writers), 'EXECUTION_INVALID', '写入索引无效')
  if (fs.existsSync(legacy)) {
    const writer = readJson<{ sessionId: string; executionId: string }>(legacy)
    writers.push({ ...writer, scopes: ['*'] })
  }
  for (const writer of writers) requireCondition(writer && typeof writer.sessionId === 'string' && writer.sessionId.length > 0
    && /^ex_[a-f0-9]{32}$/.test(writer.executionId) && Array.isArray(writer.scopes) && writer.scopes.length > 0
    && writer.scopes.every(scope => typeof scope === 'string' && scope.length > 0),
  'EXECUTION_INVALID', '写入归属无效；检查原执行记录，不删除状态抢占')
  requireCondition(new Set(writers.map(writer => writer.executionId)).size === writers.length,
    'EXECUTION_INVALID', '写入索引包含重复执行')
  requireCondition(new Set(writers.map(writer => writer.sessionId)).size === writers.length,
    'EXECUTION_INVALID', '同一会话存在多个活跃执行')
  // Persisted scopes are a cache, never the authority for permissions or ownership.
  for (const writer of writers) writer.scopes = projectWriterScopes(root, writer)
  for (let i = 0; i < writers.length; i++) for (let j = i + 1; j < writers.length; j++) {
    requireCondition(!scopesConflict(writers[i].scopes, writers[j].scopes),
      'EXECUTION_INVALID', '写入索引存在冲突范围；保留现场并人工检查')
  }
  return writers
}

function projectWriterScopes(root: string, writer: Writer): string[] {
  const file = statePath(root, writer.executionId)
  requireCondition(fs.existsSync(file), 'EXECUTION_INVALID', '缺少原执行记录；保留写入索引并恢复记录，禁止清锁重试')
  const record = readJson<Execution>(file)
  requireCondition(record?.schemaVersion === 1 && record.project === root
    && record.executionId === writer.executionId && record.sessionId === writer.sessionId
    && record.discovery?.project === root && record.discovery.sessionId === writer.sessionId
    && record.assessment?.sessionId === writer.sessionId
    && typeof record.assessment.project === 'string' && path.resolve(record.assessment.project) === root,
  'EXECUTION_INVALID', '原执行的项目、执行或会话身份不匹配；保留现场核验')
  requireCondition(Array.isArray(record.discovery.files) && record.discovery.files.length > 0
    && record.discovery.files.every(file => typeof file === 'string' && file.trim().length > 0)
    && Array.isArray(record.assessment.designFiles)
    && record.assessment.designFiles.every(file => file && typeof file.path === 'string' && file.path.trim().length > 0)
    && (record.assessment.changeId === undefined || identifier.safeParse(record.assessment.changeId).success),
  'EXECUTION_INVALID', '原执行缺少可靠的完整文件范围；恢复原记录后重试')
  const bindingFile = statePath(root, `execution-session-${hash(writer.sessionId)}`)
  requireCondition(!fs.existsSync(bindingFile)
    || readJson<{ executionId: string }>(bindingFile).executionId === writer.executionId,
  'EXECUTION_INVALID', '会话绑定与写入指针不匹配；保留现场核验')
  return executionScopes(root, [...record.discovery.files, ...record.assessment.designFiles.map(file => file.path),
    ...(record.assessment.changeId ? [`openspec/changes/${record.assessment.changeId}/tasks.md`] : [])])
}

export function writeWriters(root: string, writers: Writer[]) {
  const legacy = legacyFile(root)
  const old = fs.existsSync(legacy) ? readJson<Writer>(legacy) : undefined
  requireCondition(!old || writers.every(writer => writer.executionId !== old.executionId || writer.sessionId === old.sessionId),
    'EXECUTION_INVALID', '旧写入指针身份不匹配')
  // Keep the legacy pointer in place until its own explicit release; do not duplicate it in the new index.
  saveJson(writersFile(root), writers.filter(writer => writer.executionId !== old?.executionId))
}

export function releaseWriter(root: string, record: { executionId: string; sessionId: string }) {
  const writers = readWriters(root)
  const writer = writers.find(item => item.executionId === record.executionId)
  requireCondition(!writer || writer.sessionId === record.sessionId, 'WORKSPACE_BUSY', '写入者已变化；不得释放其它执行')
  if (!writer) return
  const legacy = legacyFile(root)
  if (fs.existsSync(legacy) && readJson<{ executionId: string }>(legacy).executionId === record.executionId) fs.unlinkSync(legacy)
  else writeWriters(root, writers.filter(item => item.executionId !== record.executionId))
}

export function scopesConflict(a: string[], b: string[]) {
  if (a.includes('*') || b.includes('*')) return true
  return a.some(left => b.some(right => {
    if (left === right) return true
    const leftModule = left.startsWith('module:') ? left.slice(7) : null
    const rightModule = right.startsWith('module:') ? right.slice(7) : null
    if (leftModule && rightModule) return leftModule.startsWith(`${rightModule}/`)
      || rightModule.startsWith(`${leftModule}/`)
    if (leftModule && right.startsWith('file:')) return right.slice(5).startsWith(`${leftModule}/`)
    if (rightModule && left.startsWith('file:')) return left.slice(5).startsWith(`${rightModule}/`)
    return false
  }))
}
