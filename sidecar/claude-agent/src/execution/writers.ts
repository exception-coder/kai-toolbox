import fs from 'node:fs'
import path from 'node:path'
import { requireCondition } from '../specResolution/contracts.js'
import { readJson, safePath, saveJson, statePath } from '../specResolution/storage.js'

export type Writer = { sessionId: string; executionId: string; scopes: string[] }
const legacyFile = (root: string) => statePath(root, 'execution-writer')
const writersFile = (root: string) => statePath(root, 'execution-writers')

/** Build roots and migrations are global; design and change claims follow their actual shared target. */
export function executionScopes(root: string, files: string[]): string[] {
  const scopes = new Set<string>()
  for (const file of files) {
    const normalized = path.relative(root, safePath(root, file)).replaceAll('\\', '/')
    const parts = normalized.split('/')
    if (parts.length < 2 || ['.github', '.forge'].includes(parts[0])
      || parts.some(part => /^(?:db|database|migrations?|schema)$/i.test(part))
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
    let module = ''
    for (let end = parts.length - 1; end > 0; end--) {
      const candidate = parts.slice(0, end).join('/')
      if (['pom.xml', 'package.json', 'build.gradle', 'build.gradle.kts', 'go.mod'].some(name => fs.existsSync(safePath(root, `${candidate}/${name}`)))) {
        module = candidate
        break
      }
    }
    scopes.add(module ? `module:${module}` : '*')
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
  return a.includes('*') || b.includes('*') || a.some(scope => b.includes(scope))
}
