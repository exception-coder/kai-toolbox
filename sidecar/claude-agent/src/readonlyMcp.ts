import { execFile } from 'node:child_process'
import { existsSync, realpathSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import { TextDecoder } from 'node:util'
import { validateReadonlySql } from './readonlyPolicy.js'
import {
  DEFAULT_GRAPH_JSON_FALLBACK_MAX_BYTES,
  GraphifyQueryCoordinator,
  isGraphJsonSafeForFallback,
} from './sourceContextGraph.js'

type JsonRpcRequest = {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

const API_BASE = (process.env.TOOLBOX_API_BASE || '').replace(/\/+$/, '')
const SOURCE_ROOT = resolveSourceRoot(process.env.TOOLBOX_SOURCE_ROOT)
const ERP_STANDBY_SCHEMA_PATH = resolveSchemaPath(process.env.ERP_STANDBY_SCHEMA_PATH)
const DATABASES = {
  erp_db_query: '/api/claude-chat/erp-db/query',
  srm_db_query: '/api/claude-chat/srm-db/query',
  scm_db_query: '/api/claude-chat/scm-db/query',
} as const

const databaseTools = Object.keys(DATABASES).map(name => ({
  name,
  description: `在${name.startsWith('erp') ? ' ERP' : name.startsWith('srm') ? ' SRM' : ' SCM'}测试库执行只读 SQL。仅允许单条 SELECT/WITH，后端使用只读连接二次拦截。`,
  inputSchema: {
    type: 'object',
    properties: {
      sql: { type: 'string', description: '单条只读 SELECT/WITH SQL' },
      params: { type: 'array', description: 'SQL 参数化占位值' },
    },
    required: ['sql'],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
}))

const sourceTools = SOURCE_ROOT ? [
  {
    name: 'source_context',
    description: '源码定位的首要入口：先定位 URL，再查询当前项目 Graphify 图谱并返回候选文件与调用链上下文；可带候选符号再次调用以反问图谱。任何源码搜索前必须先调用本工具。',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '用户的完整业务问题，保留菜单、按钮、提示和业务对象' },
        url: { type: 'string', description: '可选页面 URL 或 action 路径；未传时会从 question 中识别' },
        module: { type: 'string', description: '可选模块名，用于多子项目图谱选择' },
        graphBudget: { type: 'integer', minimum: 200, maximum: 2000, description: 'Graphify 返回 token 预算，默认 1200' },
      },
      required: ['question'],
      additionalProperties: false,
    },
    annotations: readonlyAnnotations(),
  },
  {
    name: 'source_search',
    description: 'Graphify 和业务知识已收敛范围后，在指定子目录内做纯文本兜底搜索。禁止仓库根目录扫描，永久排除 graphify-out。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '要搜索的文本，不按正则解释' },
        path: { type: 'string', description: '必填：Graphify 返回的候选文件或明确子目录；不得是源码根目录' },
        caseSensitive: { type: 'boolean', description: '是否区分大小写，默认否' },
        maxResults: { type: 'integer', minimum: 1, maximum: 200, description: '最多返回命中数，默认 80' },
      },
      required: ['query', 'path'],
      additionalProperties: false,
    },
    annotations: readonlyAnnotations(),
  },
  {
    name: 'source_read',
    description: '分段读取当前业务系统源码目录内的文本文件，并返回带行号的内容。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对源码根目录的文件路径' },
        startLine: { type: 'integer', minimum: 1, description: '起始行，默认 1' },
        endLine: { type: 'integer', minimum: 1, description: '结束行，默认起始行后 399 行，单次最多 800 行' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    annotations: readonlyAnnotations(),
  },
] : []

const standbySchemaTools = ERP_STANDBY_SCHEMA_PATH ? [
  {
    name: 'erp_standby_schema_search',
    description: '搜索 ERP 生产备库 DDL 快照中的真实表、视图和字段。用于确认备库可用对象；名称相似结果仅是候选，不等于替代关系。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '表名、视图名或字段名关键词' },
        maxResults: { type: 'integer', minimum: 1, maximum: 50, description: '最多返回对象数，默认 20' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: readonlyAnnotations(),
  },
  {
    name: 'erp_standby_validate_sql',
    description: '输出 ERP 生产查询 SQL 前的强制静态校验：核对 FROM/JOIN 对象是否存在于生产备库 DDL 快照，并核对可明确归属的别名字段。只校验，不执行 SQL。',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: '准备交付给 ERP 生产备库执行的单条 SELECT/WITH SQL' },
      },
      required: ['sql'],
      additionalProperties: false,
    },
    annotations: readonlyAnnotations(),
  },
] : []

const tools = [...(API_BASE ? databaseTools : []), ...sourceTools, ...standbySchemaTools]
const SKIPPED_DIRECTORIES = new Set([
  '.git', '.idea', '.vscode', 'node_modules', 'target', 'dist', 'build', 'out', 'coverage', '.next', '.cache',
  'graphify-out',
])
const SOURCE_EXTENSIONS = new Set([
  '.java', '.kt', '.kts', '.xml', '.jsp', '.jspx', '.js', '.jsx', '.ts', '.tsx', '.vue', '.css', '.scss',
  '.html', '.htm', '.sql', '.properties', '.yml', '.yaml', '.json', '.md', '.txt', '.py', '.go', '.dart',
  '.cs', '.php', '.rb', '.sh', '.ps1', '.bat', '.cmd', '.gradle', '.groovy', '.toml', '.ini', '.conf',
])
const SOURCE_FILE_NAMES = new Set(['dockerfile', 'makefile', 'pom.xml'])
const MAX_SOURCE_FILE_BYTES = 2 * 1024 * 1024
const MAX_SCANNED_FILES = 12_000
const MAX_OUTPUT_CHARS = 180_000
const GRAPHIFY_TOTAL_BUDGET_MS = clampInteger(
  Number(process.env.CONSULT_GRAPHIFY_TOTAL_BUDGET_MS || process.env.CONSULT_GRAPHIFY_TIMEOUT_MS),
  52_000,
  10_000,
  55_000,
)
const GRAPHIFY_RUNTIME_URL = process.env.CONSULT_GRAPHIFY_RUNTIME_URL?.trim() || ''
const GRAPHIFY_RUNTIME_TOKEN = process.env.CONSULT_GRAPHIFY_RUNTIME_TOKEN?.trim() || ''
const GRAPH_JSON_FALLBACK_MAX_BYTES = clampInteger(
  Number(process.env.CONSULT_GRAPH_JSON_FALLBACK_MAX_BYTES),
  DEFAULT_GRAPH_JSON_FALLBACK_MAX_BYTES,
  1 * 1024 * 1024,
  128 * 1024 * 1024,
)
const graphifyQueries = new GraphifyQueryCoordinator()
let routeMapPathsPromise: Promise<string[]> | null = null

function readonlyAnnotations(): Record<string, boolean> {
  return {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  }
}

function resolveSourceRoot(value?: string): string | null {
  if (!value?.trim()) return null
  try {
    const root = realpathSync(resolve(value.trim()))
    return statSync(root).isDirectory() ? root : null
  } catch {
    return null
  }
}

function resolveSchemaPath(value?: string): string | null {
  if (!value?.trim()) return null
  try {
    const path = realpathSync(resolve(value.trim()))
    return statSync(path).isFile() ? path : null
  } catch {
    return null
  }
}

type StandbyObject = {
  name: string
  type: 'TABLE' | 'VIEW'
  columns: string[]
}

let standbyCatalog: Map<string, StandbyObject> | null = null

function loadStandbyCatalog(): Map<string, StandbyObject> {
  if (!ERP_STANDBY_SCHEMA_PATH) throw new Error('ERP 生产备库结构快照未配置')
  if (standbyCatalog) return standbyCatalog
  const ddl = decodeSourceFile(ERP_STANDBY_SCHEMA_PATH)
  const catalog = new Map<string, StandbyObject>()
  const objectPattern = /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(TABLE|VIEW)\s+(?:"[^"]+"\.)?(?:"([^"]+)"|([A-Z0-9_$#]+))([\s\S]*?)(?=^\s*(?:CREATE|DROP|ALTER|COMMENT|GRANT)\s|(?![\s\S]))/gim
  for (const match of ddl.matchAll(objectPattern)) {
    const type = match[1].toUpperCase() as StandbyObject['type']
    const name = (match[2] || match[3]).toUpperCase()
    const explicitColumns = [...match[4].matchAll(/^\s*"([^"]+)"\s+/gm)]
      .map(column => column[1].toUpperCase())
    const viewProjection = type === 'VIEW' ? match[4].match(/\bSELECT\b([\s\S]*?)\bFROM\b/i)?.[1] ?? '' : ''
    const projectedColumns = [...viewProjection.matchAll(/\.\s*"([^"]+)"|\bAS\s+"([^"]+)"/gi)]
      .map(column => (column[1] || column[2]).toUpperCase())
    const columns = explicitColumns.length ? explicitColumns : projectedColumns
    catalog.set(name, { name, type, columns: [...new Set(columns)] })
  }
  standbyCatalog = catalog
  return catalog
}

function standbySchemaSearch(args: Record<string, unknown>): Record<string, unknown> {
  const query = typeof args.query === 'string' ? args.query.trim().toUpperCase() : ''
  if (!query) throw new Error('erp_standby_schema_search.query 不能为空')
  const maxResults = clampInteger(args.maxResults, 20, 1, 50)
  const catalog = loadStandbyCatalog()
  const matches = [...catalog.values()]
    .map(object => ({
      object,
      nameMatch: object.name.includes(query),
      matchingColumns: object.columns.filter(column => column.includes(query)).slice(0, 30),
    }))
    .filter(result => result.nameMatch || result.matchingColumns.length)
    .sort((left, right) => Number(right.nameMatch) - Number(left.nameMatch)
      || left.object.name.localeCompare(right.object.name))
    .slice(0, maxResults)
  return textResult(JSON.stringify({
    schemaPath: ERP_STANDBY_SCHEMA_PATH,
    objectCount: catalog.size,
    results: matches.map(({ object, matchingColumns }) => ({ ...object, matchingColumns })),
  }, null, 2))
}

function normalizeSqlIdentifier(value: string): string {
  const parts = value.split('.')
  return parts[parts.length - 1].replaceAll('"', '').toUpperCase()
}

function candidateObjects(name: string, catalog: Map<string, StandbyObject>): Array<Pick<StandbyObject, 'name' | 'type'>> {
  const tokens = name.split(/[_$#]+/).filter(token => token.length >= 3)
  return [...catalog.values()]
    .map(object => ({ object, score: tokens.reduce((score, token) => score + Number(object.name.includes(token)), 0) }))
    .filter(result => result.score > 0)
    .sort((left, right) => right.score - left.score || left.object.name.localeCompare(right.object.name))
    .slice(0, 8)
    .map(result => ({ name: result.object.name, type: result.object.type }))
}

function validateStandbySql(args: Record<string, unknown>): Record<string, unknown> {
  const sql = typeof args.sql === 'string' ? args.sql.trim() : ''
  const violation = validateReadonlySql(sql)
  if (violation) throw new Error(`已拒绝：${violation}`)
  const catalog = loadStandbyCatalog()
  const references = [...sql.matchAll(/\b(?:FROM|JOIN)\s+((?:"[^"]+"|[A-Z0-9_$#]+)(?:\s*\.\s*(?:"[^"]+"|[A-Z0-9_$#]+))?)(?:\s+(?:AS\s+)?("?[A-Z][A-Z0-9_$#]*"?))?/gi)]
    .filter(match => !match[1].trim().startsWith('('))
    .map(match => ({ name: normalizeSqlIdentifier(match[1].replace(/\s/g, '')), alias: match[2]?.replaceAll('"', '').toUpperCase() }))
  const uniqueReferences = [...new Map(references.map(reference => [reference.name, reference])).values()]
  const aliases = new Map<string, StandbyObject>()
  for (const reference of references) {
    const object = catalog.get(reference.name)
    if (object) aliases.set(reference.alias || reference.name, object)
  }
  const missingObjects = uniqueReferences
    .filter(reference => !catalog.has(reference.name))
    .map(reference => ({ name: reference.name, candidates: candidateObjects(reference.name, catalog) }))
  const missingColumns = [...sql.matchAll(/\b("?[A-Z][A-Z0-9_$#]*"?)\s*\.\s*("?[A-Z][A-Z0-9_$#]*"?)/gi)]
    .map(match => ({ alias: match[1].replaceAll('"', '').toUpperCase(), column: match[2].replaceAll('"', '').toUpperCase() }))
    .filter(reference => aliases.has(reference.alias))
    .filter(reference => aliases.get(reference.alias)!.columns.length > 0)
    .filter(reference => !aliases.get(reference.alias)!.columns.includes(reference.column))
  const unknownColumnObjects = [...new Set([...aliases.values()]
    .filter(object => object.columns.length === 0)
    .map(object => object.name))]
  const objects = uniqueReferences
    .filter(reference => catalog.has(reference.name))
    .map(reference => catalog.get(reference.name)!)
  return textResult(JSON.stringify({
    valid: references.length > 0 && missingObjects.length === 0 && missingColumns.length === 0,
    schemaPath: ERP_STANDBY_SCHEMA_PATH,
    checkedObjects: objects,
    missingObjects,
    missingColumns,
    warnings: [
      ...(references.length ? [] : ['未能从 SQL 的 FROM/JOIN 中识别校验对象']),
      ...(unknownColumnObjects.length ? [`以下对象未能从 DDL 推导字段，未执行字段级判定：${unknownColumnObjects.join(', ')}`] : []),
      '候选对象只表示名称相关，不证明表与视图存在替代关系。',
      '未带对象别名且无法唯一归属的字段不做自动判定。',
    ],
  }, null, 2))
}

function resolveWithinSourceRoot(requestedPath: string): string {
  if (!SOURCE_ROOT) throw new Error('当前会话未绑定可读取的源码目录')
  const unresolved = resolve(SOURCE_ROOT, requestedPath || '.')
  const unresolvedRelative = relative(SOURCE_ROOT, unresolved)
  if (unresolvedRelative === '..' || unresolvedRelative.startsWith('..' + sep) || isAbsolute(unresolvedRelative)) {
    throw new Error('请求路径超出当前会话源码目录')
  }
  const candidate = realpathSync(unresolved)
  const rel = relative(SOURCE_ROOT, candidate)
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
    throw new Error('请求路径超出当前会话源码目录')
  }
  return candidate
}

function decodeSourceFile(path: string): string {
  const buffer = readFileSync(path)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('gb18030').decode(buffer)
  }
}

function isSourceFile(path: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  const name = normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase()
  const dot = name.lastIndexOf('.')
  return SOURCE_FILE_NAMES.has(name) || (dot >= 0 && SOURCE_EXTENSIONS.has(name.slice(dot)))
}

function textResult(text: string, isError = false): Record<string, unknown> {
  return { content: [{ type: 'text', text: text.slice(0, MAX_OUTPUT_CHARS) }], ...(isError ? { isError: true } : {}) }
}

function walkSourceFiles(target: string, onFile: (path: string) => boolean): number {
  let scannedFiles = 0

  const visit = (path: string): boolean => {
    if (scannedFiles >= MAX_SCANNED_FILES) return false
    const stat = statSync(path)
    if (stat.isFile()) {
      scannedFiles++
      if (isSourceFile(path) && stat.size <= MAX_SOURCE_FILE_BYTES) return onFile(path)
      return true
    }
    if (!stat.isDirectory()) return true
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name))) continue
      if (!visit(resolve(path, entry.name))) return false
    }
    return true
  }

  visit(target)
  return scannedFiles
}

function findTextMatches(target: string, query: string, caseSensitive: boolean, maxResults: number): {
  results: string[]
  scannedFiles: number
} {
  const needle = caseSensitive ? query : query.toLocaleLowerCase()
  const results: string[] = []
  const scannedFiles = walkSourceFiles(target, path => {
    const lines = decodeSourceFile(path).split(/\r?\n/)
    const displayPath = relative(SOURCE_ROOT!, path)
    for (let index = 0; index < lines.length && results.length < maxResults; index++) {
      const haystack = caseSensitive ? lines[index] : lines[index].toLocaleLowerCase()
      if (haystack.includes(needle)) results.push(`${displayPath}:${index + 1}: ${lines[index].trim()}`)
    }
    return results.length < maxResults
  })
  return { results, scannedFiles }
}

function findFilesByName(target: string, fileName: string, maxResults: number): string[] {
  const results: string[] = []
  const visit = (path: string): boolean => {
    const stat = statSync(path)
    if (!stat.isDirectory()) return true
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name))) continue
      const child = resolve(path, entry.name)
      if (entry.isFile() && entry.name.toLocaleLowerCase() === fileName.toLocaleLowerCase()) {
        results.push(child)
        if (results.length >= maxResults) return false
      }
      if (entry.isDirectory() && !visit(child)) return false
    }
    return true
  }
  visit(target)
  return results
}

function graphDirectories(moduleName: string): string[] {
  if (!SOURCE_ROOT) return []
  const hasGraph = (path: string) => existsSync(resolve(path, 'graphify-out', 'graph.json'))
  if (hasGraph(SOURCE_ROOT)) return [SOURCE_ROOT]
  const candidates = readdirSync(SOURCE_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.isSymbolicLink())
    .map(entry => resolve(SOURCE_ROOT, entry.name))
    .filter(hasGraph)
    .sort((a, b) => a.localeCompare(b))
  if (!moduleName.trim()) return candidates.slice(0, 1)
  const needles = moduleName.toLocaleLowerCase().split(/[,，、\s]+/).filter(Boolean)
  const matched = candidates.filter(path => needles.some(needle => basename(path).toLocaleLowerCase().includes(needle)))
  return (matched.length ? matched : candidates).slice(0, 1)
}

function queryGraphJson(graphRoot: string, question: string, maxNodes = 24): string {
  const graphPath = resolve(graphRoot, 'graphify-out', 'graph.json')
  const graphSize = statSync(graphPath).size
  if (!isGraphJsonSafeForFallback(graphSize, GRAPH_JSON_FALLBACK_MAX_BYTES)) {
    return `Graphify 在本次总预算内未返回；graph.json 为 ${Math.ceil(graphSize / 1024 / 1024)} MB，已跳过不安全的整文件回退。请先使用上方 URL 候选精确读取源码，稍后可带类名或方法名再次查询图谱。`
  }
  const graph = JSON.parse(decodeSourceFile(graphPath)) as {
    nodes?: Array<Record<string, unknown>>
    links?: Array<Record<string, unknown>>
  }
  const terms = [...new Set((question.match(/[A-Za-z0-9_./-]{3,}|[\u4e00-\u9fff]{2,12}/g) ?? [])
    .map(term => term.toLocaleLowerCase()))]
  const scored = (graph.nodes ?? []).map(node => {
    const text = [node.label, node.id, node.source_file, node.community_name]
      .filter(value => typeof value === 'string').join(' ').toLocaleLowerCase()
    const score = terms.reduce((sum, term) => sum + (text.includes(term) ? Math.min(term.length, 12) : 0), 0)
    return { node, score }
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, maxNodes)
  if (!scored.length) return 'Graphify CLI 不可用，graph.json 直接匹配也未找到节点。'
  const ids = new Set(scored.map(item => String(item.node.id ?? '')))
  const links = (graph.links ?? []).filter(link => ids.has(String(link.source ?? '')) || ids.has(String(link.target ?? '')))
    .slice(0, maxNodes)
  return JSON.stringify({
    mode: 'graph-json-fallback',
    nodes: scored.map(item => item.node),
    links,
  }, null, 2)
}

function runFile(file: string, args: string[], options: {
  cwd: string
  timeout: number
  maxBuffer: number
}): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(file, args, {
      ...options,
      encoding: 'utf8',
      windowsHide: true,
    }, (error, stdout) => {
      if (error) reject(error)
      else resolvePromise(stdout.trim())
    })
  })
}

async function queryGraphify(question: string, moduleName: string, budget: number): Promise<string> {
  const graphRoot = graphDirectories(moduleName)[0]
  if (!graphRoot) return '当前项目未找到 graphify-out/graph.json。'
  const key = `${graphRoot}\n${budget}\n${question}`
  return graphifyQueries.resolve(key, async () => {
    const deadline = Date.now() + GRAPHIFY_TOTAL_BUDGET_MS
    if (GRAPHIFY_RUNTIME_URL && GRAPHIFY_RUNTIME_TOKEN) {
      try {
        const persistent = await queryPersistentGraphify(graphRoot, question, budget, remainingMs(deadline))
        if (persistent.kind === 'ready') return persistent.text
        if (persistent.kind === 'pending') {
          return `Graphify 代码图谱正在由 Sidecar 常驻运行时预热（阶段：${persistent.phase}）。后台任务仍在继续，本次不会再启动第二个冷进程；请先使用上方 URL 候选精确读取源码，约 ${Math.ceil(persistent.retryAfterMs / 1000)} 秒后带已发现的类名或方法名再次查询。`
        }
        process.stderr.write(`[consult-readonly] Graphify 常驻后端不可用，评估有界 CLI 回退：${persistent.message}\n`)
      } catch (error) {
        process.stderr.write(`[consult-readonly] Graphify 常驻接口异常，评估有界 CLI 回退：${error instanceof Error ? error.message : String(error)}\n`)
      }
    }
    const cliBudget = remainingMs(deadline) - 1_500
    if (cliBudget < 3_000) return queryGraphJson(graphRoot, question)
    try {
      return await runFile(process.env.GRAPHIFY_BINARY?.trim() || 'graphify',
        ['query', question, '--budget', String(budget)], {
          cwd: graphRoot,
          timeout: cliBudget,
          maxBuffer: 2 * 1024 * 1024,
        })
    } catch {
      return queryGraphJson(graphRoot, question)
    }
  }, () => 'Graphify 正在处理另一项图谱查询；本次已快速降级，避免 MCP 排队超时。请先使用上方 URL 候选精确读取源码，稍后带已发现的类名或方法名再次查询。')
}

type PersistentGraphifyOutcome =
  | { kind: 'ready'; text: string }
  | { kind: 'pending'; phase: string; retryAfterMs: number }
  | { kind: 'unavailable'; message: string }

async function queryPersistentGraphify(
  graphRoot: string,
  question: string,
  budget: number,
  timeoutMs: number,
): Promise<PersistentGraphifyOutcome> {
  const response = await fetch(GRAPHIFY_RUNTIME_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GRAPHIFY_RUNTIME_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ projectPath: graphRoot, question, tokenBudget: budget, mode: 'bfs' }),
    signal: AbortSignal.timeout(Math.max(1_000, timeoutMs)),
  })
  const payload = await response.json() as {
    ok?: boolean
    code?: unknown
    text?: unknown
    message?: unknown
    phase?: unknown
    retryAfterMs?: unknown
  }
  if (response.status === 202 && (payload.code === 'GRAPHIFY_WARMING' || payload.code === 'GRAPHIFY_BUSY')) {
    return {
      kind: 'pending',
      phase: typeof payload.phase === 'string' ? payload.phase : 'warming',
      retryAfterMs: typeof payload.retryAfterMs === 'number' ? payload.retryAfterMs : 5_000,
    }
  }
  if (response.ok && payload.ok === true && typeof payload.text === 'string' && payload.text.trim()) {
    return { kind: 'ready', text: payload.text.trim() }
  }
  return {
    kind: 'unavailable',
    message: typeof payload.message === 'string' ? payload.message : `HTTP ${response.status}`,
  }
}

function remainingMs(deadline: number): number {
  return Math.max(0, deadline - Date.now())
}

function extractActionUrl(question: string, explicitUrl: string): string {
  const raw = explicitUrl.trim() || question.match(/(?:https?:\/\/[^\s]+)?\/[A-Za-z0-9_./-]+\.action(?:\?[^\s]*)?/i)?.[0] || ''
  if (!raw) return ''
  try {
    const pathname = raw.startsWith('http') ? new URL(raw).pathname : raw.split('?')[0]
    return decodeURIComponent(pathname).replace(/^\/+/, '')
  } catch {
    return raw.split('?')[0].replace(/^\/+/, '')
  }
}

function splitOutputLines(output: string, maxResults: number): string[] {
  return output.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, maxResults)
}

async function findRouteMaps(): Promise<string[]> {
  if (!SOURCE_ROOT) return []
  if (!routeMapPathsPromise) {
    routeMapPathsPromise = runFile('rg', [
      '--files', SOURCE_ROOT,
      '--glob', 'url-route-map.md',
      '--glob', '!graphify-out/**',
      '--glob', '!node_modules/**',
      '--glob', '!target/**',
    ], { cwd: SOURCE_ROOT, timeout: 5_000, maxBuffer: 256 * 1024 })
      .then(output => splitOutputLines(output, 8))
      .catch(() => [])
  }
  return routeMapPathsPromise
}

async function searchRouteWithRipgrep(routeName: string, targets: string[], maxResults: number): Promise<string[]> {
  if (!SOURCE_ROOT || !targets.length) return []
  try {
    const output = await runFile('rg', [
      '-n', '-F', '--no-heading', '--color', 'never',
      '--max-count', String(maxResults),
      '--max-filesize', '2M',
      '--glob', '!graphify-out/**',
      '--glob', '!node_modules/**',
      '--glob', '!target/**',
      routeName,
      ...targets,
    ], { cwd: SOURCE_ROOT, timeout: 8_000, maxBuffer: 512 * 1024 })
    return splitOutputLines(output, maxResults)
  } catch {
    return []
  }
}

async function locateUrl(route: string): Promise<string[]> {
  if (!SOURCE_ROOT || !route) return []
  const routeName = basename(route)
  const routeMaps = await findRouteMaps()
  const mapHits = await searchRouteWithRipgrep(routeName, routeMaps, 20)
  if (mapHits.length) return mapHits
  const preferredRoots = [
    'WebRoot', 'web', 'frontend/src', 'src/main', 'src',
  ].map(path => resolve(SOURCE_ROOT, path))
    .filter(path => existsSync(path) && statSync(path).isDirectory())
    // src/main 已覆盖时不再重复扫描其父级 src。
    .filter((path, index, paths) => !paths.some((other, otherIndex) => otherIndex < index && other.startsWith(path + sep)))
  return searchRouteWithRipgrep(routeName, preferredRoots, 30)
}

async function buildSourceContext(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const question = typeof args.question === 'string' ? args.question.trim() : ''
  if (!question) throw new Error('source_context.question 不能为空')
  const explicitUrl = typeof args.url === 'string' ? args.url : ''
  const moduleName = typeof args.module === 'string' ? args.module : ''
  const route = extractActionUrl(question, explicitUrl)
  const graphQuestion = [route ? `页面路由 ${route}` : '', question, moduleName ? `模块 ${moduleName}` : '']
    .filter(Boolean).join('\n')
  const [routeHits, graph] = await Promise.all([
    locateUrl(route),
    queryGraphify(graphQuestion, moduleName, clampInteger(args.graphBudget, 1200, 200, 2000)),
  ])
  return textResult([
    '【URL 定位】',
    route || '问题中未识别到 action URL。',
    routeHits.length ? routeHits.join('\n') : '未命中 URL 路由表或源码中的精确路由。',
    '',
    '【Graphify 代码图谱】',
    graph,
    '',
    '【下一步】先调用业务知识工具核对业务语义，再对以上候选文件使用 source_read；需要继续追调用链时，带已发现的类名、方法名或 SQL ID 再次调用 source_context 反问图谱。只有图谱反问后证据仍不足，才在明确子目录调用 source_search。',
  ].join('\n'))
}

function searchSource(args: Record<string, unknown>): Record<string, unknown> {
  const query = typeof args.query === 'string' ? args.query : ''
  const requestedPath = typeof args.path === 'string' ? args.path.trim() : ''
  if (!query.trim()) throw new Error('source_search.query 不能为空')
  if (!requestedPath || requestedPath === '.' || requestedPath === './' || requestedPath === '.\\') {
    throw new Error('source_search 只允许在 Graphify 已收敛的文件或子目录中检索，禁止源码根目录扫描')
  }
  const target = resolveWithinSourceRoot(requestedPath)
  if (target === SOURCE_ROOT) throw new Error('source_search 禁止源码根目录扫描')
  const relativeTarget = relative(SOURCE_ROOT!, target).replace(/\\/g, '/')
  if (relativeTarget === 'graphify-out' || relativeTarget.startsWith('graphify-out/')) {
    throw new Error('source_search 禁止扫描 graphify-out；请使用 source_context 查询代码图谱')
  }
  const maxResults = clampInteger(args.maxResults, 80, 1, 200)
  const { results, scannedFiles } = findTextMatches(target, query, args.caseSensitive === true, maxResults)

  const suffix = scannedFiles >= MAX_SCANNED_FILES ? `\n已达到扫描上限 ${MAX_SCANNED_FILES} 个文件，请缩小 path。` : ''
  return textResult((results.join('\n') || '未找到匹配内容。') + suffix)
}

function readSource(args: Record<string, unknown>): Record<string, unknown> {
  const requestedPath = typeof args.path === 'string' ? args.path : ''
  if (!requestedPath.trim()) throw new Error('source_read.path 不能为空')
  const target = resolveWithinSourceRoot(requestedPath)
  const relativeTarget = relative(SOURCE_ROOT!, target).replace(/\\/g, '/')
  if (relativeTarget === 'graphify-out' || relativeTarget.startsWith('graphify-out/')) {
    throw new Error('source_read 不直接读取 graphify-out；请使用 source_context 获取图谱上下文')
  }
  const stat = statSync(target)
  if (!stat.isFile()) throw new Error('source_read.path 必须是文件')
  if (!isSourceFile(target)) throw new Error('仅允许读取源码或文本配置文件')
  if (stat.size > MAX_SOURCE_FILE_BYTES) throw new Error('文件超过 2 MB，请改用更精确的源码文件')
  const lines = decodeSourceFile(target).split(/\r?\n/)
  const startLine = clampInteger(args.startLine, 1, 1, Math.max(1, lines.length))
  const requestedEnd = clampInteger(args.endLine, startLine + 399, startLine, Math.max(startLine, lines.length))
  const endLine = Math.min(requestedEnd, startLine + 799, lines.length)
  const content = lines.slice(startLine - 1, endLine)
    .map((line, index) => `${startLine + index}: ${line}`)
    .join('\n')
  return textResult(`${relative(SOURCE_ROOT!, target)}:${startLine}-${endLine}\n${content}`)
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' && Number.isInteger(value) ? value : fallback
  return Math.min(max, Math.max(min, parsed))
}

function send(payload: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(payload) + '\n')
}

function ok(id: JsonRpcRequest['id'], result: unknown): void {
  send({ jsonrpc: '2.0', id, result })
}

function fail(id: JsonRpcRequest['id'], code: number, message: string): void {
  send({ jsonrpc: '2.0', id, error: { code, message } })
}

async function callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    if (name === 'source_context') return buildSourceContext(args)
    if (name === 'source_search') return searchSource(args)
    if (name === 'source_read') return readSource(args)
    if (name === 'erp_standby_schema_search') return standbySchemaSearch(args)
    if (name === 'erp_standby_validate_sql') return validateStandbySql(args)
  } catch (error) {
    return textResult(error instanceof Error ? error.message : String(error), true)
  }
  const endpoint = DATABASES[name as keyof typeof DATABASES]
  if (!endpoint) {
    return { content: [{ type: 'text', text: `工具不在业务咨询只读白名单中：${name}` }], isError: true }
  }
  const sql = typeof args.sql === 'string' ? args.sql : ''
  const violation = validateReadonlySql(sql)
  if (violation) {
    return { content: [{ type: 'text', text: `已拒绝：${violation}` }], isError: true }
  }
  if (!API_BASE) {
    return { content: [{ type: 'text', text: 'TOOLBOX_API_BASE 未配置，无法查询测试库' }], isError: true }
  }
  try {
    const response = await fetch(API_BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params: Array.isArray(args.params) ? args.params : [] }),
      signal: AbortSignal.timeout(20_000),
    })
    const text = await response.text()
    return {
      content: [{ type: 'text', text: text.slice(0, 200_000) }],
      ...(response.ok ? {} : { isError: true }),
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
      isError: true,
    }
  }
}

async function handle(message: JsonRpcRequest): Promise<void> {
  const id = message.id
  switch (message.method) {
    case 'initialize':
      ok(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'consult-readonly', version: '1.0.0' },
      })
      return
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return
    case 'ping':
      ok(id, {})
      return
    case 'tools/list':
      ok(id, { tools })
      return
    case 'tools/call': {
      const params = message.params ?? {}
      const name = typeof params.name === 'string' ? params.name : ''
      const args = params.arguments && typeof params.arguments === 'object'
        ? params.arguments as Record<string, unknown>
        : {}
      ok(id, await callTool(name, args))
      return
    }
    default:
      if (id != null) fail(id, -32601, `Method not found: ${message.method ?? ''}`)
  }
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
input.on('line', line => {
  if (!line.trim()) return
  try {
    const message = JSON.parse(line) as JsonRpcRequest
    void handle(message).catch(error => fail(message.id, -32603, error instanceof Error ? error.message : String(error)))
  } catch {
    fail(null, -32700, 'Parse error')
  }
})
