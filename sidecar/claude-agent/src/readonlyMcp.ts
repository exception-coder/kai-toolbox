import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import { TextDecoder } from 'node:util'
import { validateReadonlySql } from './readonlyPolicy.js'

type JsonRpcRequest = {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

const API_BASE = (process.env.TOOLBOX_API_BASE || '').replace(/\/+$/, '')
const SOURCE_ROOT = resolveSourceRoot(process.env.TOOLBOX_SOURCE_ROOT)
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

const tools = [...(API_BASE ? databaseTools : []), ...sourceTools]
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
  const graph = JSON.parse(decodeSourceFile(resolve(graphRoot, 'graphify-out', 'graph.json'))) as {
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

function queryGraphify(question: string, moduleName: string, budget: number): string {
  const graphRoot = graphDirectories(moduleName)[0]
  if (!graphRoot) return '当前项目未找到 graphify-out/graph.json。'
  try {
    return execFileSync(process.env.GRAPHIFY_BINARY?.trim() || 'graphify',
      ['query', question, '--budget', String(budget)], {
        cwd: graphRoot,
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      }).trim()
  } catch {
    return queryGraphJson(graphRoot, question)
  }
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

function locateUrl(route: string): string[] {
  if (!SOURCE_ROOT || !route) return []
  const routeName = basename(route)
  const routeMaps = findFilesByName(SOURCE_ROOT, 'url-route-map.md', 8)
  const mapHits = routeMaps.flatMap(path => findTextMatches(path, routeName, false, 20).results)
  if (mapHits.length) return mapHits
  const preferredRoots = [
    'WebRoot', 'web', 'frontend/src', 'src/main', 'src',
  ].map(path => resolve(SOURCE_ROOT, path))
    .filter(path => existsSync(path) && statSync(path).isDirectory())
    // src/main 已覆盖时不再重复扫描其父级 src。
    .filter((path, index, paths) => !paths.some((other, otherIndex) => otherIndex < index && other.startsWith(path + sep)))
  const hits: string[] = []
  for (const root of preferredRoots) {
    hits.push(...findTextMatches(root, routeName, false, 30 - hits.length).results)
    if (hits.length >= 30) break
  }
  return hits
}

function buildSourceContext(args: Record<string, unknown>): Record<string, unknown> {
  const question = typeof args.question === 'string' ? args.question.trim() : ''
  if (!question) throw new Error('source_context.question 不能为空')
  const explicitUrl = typeof args.url === 'string' ? args.url : ''
  const moduleName = typeof args.module === 'string' ? args.module : ''
  const route = extractActionUrl(question, explicitUrl)
  const routeHits = locateUrl(route)
  const graphQuestion = [route ? `页面路由 ${route}` : '', question, moduleName ? `模块 ${moduleName}` : '']
    .filter(Boolean).join('\n')
  const graph = queryGraphify(graphQuestion, moduleName, clampInteger(args.graphBudget, 1200, 200, 2000))
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
