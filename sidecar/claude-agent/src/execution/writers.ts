import fs from 'node:fs'
import path from 'node:path'
import { requireCondition } from '../specResolution/contracts.js'
import { readJson, safePath, saveJson, statePath } from '../specResolution/storage.js'

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
    if (parts.length < 2 || ['.github', '.forge'].includes(parts[0])
      || ['docs/ai-coding-architecture.md', 'docs/product-philosophy.md'].includes(normalized)) {
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
      else scopes.add('*')
      continue
    }
    const module = enclosingModule(root, parts)
    if (!module) {
      scopes.add('*')
      continue
    }
    const moduleParts = module.split('/')
    const domainIndex = parts.findIndex((part, index) => index >= moduleParts.length
      && domainFolders.has(part) && index + 1 < parts.length - 1)
    if (domainIndex >= 0) {
      scopes.add(`module:${parts.slice(0, domainIndex + 2).join('/')}`)
    } else if (module === 'frontend' && !sharedBuildFiles.has(parts.at(-1) || '')
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
  for (let i = 0; i < writers.length; i++) for (let j = i + 1; j < writers.length; j++) {
    requireCondition(!scopesConflict(writers[i].scopes, writers[j].scopes),
      'EXECUTION_INVALID', '写入索引存在冲突范围；保留现场并人工检查')
  }
  return writers
}

export function writeWriters(root: string, writers: Writer[]) {
  saveJson(writersFile(root), writers)
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
