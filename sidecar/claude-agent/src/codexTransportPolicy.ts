import { open, stat, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'

// The observed upstream decoded-message ceiling is 16 MiB. Reserve 4 MiB for
// native instructions, tool schemas and the response.create envelope we do not own.
export const CODEX_WS_CONTEXT_BUDGET_BYTES = 12 * 1024 * 1024
export const CODEX_HTTPS_PROVIDER = 'forge_openai_https'
const CACHE_LIMIT = 32
const HISTORY_READ_CHUNK_BYTES = 1024 * 1024
const require = createRequire(import.meta.url)
const cliVersion: string = require('@openai/codex/package.json').version
type Json = Record<string, unknown>
type Request = (method: string, params: Json) => Promise<Json>
type Options = {
  threadId?: string
  codexHome?: string
  cwd: string
  config?: Json
  input: Json[]
}
export type CodexTransportSelection = {
  config: Json
  modelProvider?: string
  contextBytes?: number
  reason?: 'large_context'
}

function record(value: unknown): Json {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
}

function httpsProvider(baseUrl: string | undefined): Json {
  return {
    name: 'OpenAI', wire_api: 'responses', requires_openai_auth: true,
    supports_websockets: false, supports_standalone_web_search: true,
    http_headers: { version: cliVersion },
    env_http_headers: { 'OpenAI-Organization': 'OPENAI_ORGANIZATION', 'OpenAI-Project': 'OPENAI_PROJECT' },
    ...(baseUrl ? { base_url: baseUrl } : {}),
  }
}

function isManagedHttpsProvider(value: unknown, expected: Json): boolean {
  const configured = record(value)
  return configured.name === expected.name
    && configured.wire_api === expected.wire_api
    && configured.requires_openai_auth === expected.requires_openai_auth
    && configured.supports_websockets === expected.supports_websockets
    && configured.supports_standalone_web_search === expected.supports_standalone_web_search
    && configured.base_url === expected.base_url
}

const jsonBytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8')
const historyCache = new Map<string, { size: number; mtimeMs: number; bytes: number }>()

async function* newestHistoryLines(path: string, size: number): AsyncGenerator<string> {
  const file = await open(path, 'r')
  let position = size
  let remainder = Buffer.alloc(0)
  try {
    while (position > 0) {
      const length = Math.min(position, HISTORY_READ_CHUNK_BYTES)
      position -= length
      const chunk = Buffer.allocUnsafe(length)
      const result = await file.read(chunk, 0, length, position)
      if (result.bytesRead !== length) throw new Error('Codex context changed during transport preflight')
      const buffer = Buffer.concat([chunk, remainder])
      let end = buffer.length
      for (let index = buffer.lastIndexOf(10); index >= 0; index = buffer.lastIndexOf(10, index - 1)) {
        const line = buffer.subarray(index + 1, end).toString('utf8').trim()
        if (line) yield line
        end = index
        if (index === 0) break
      }
      remainder = Buffer.from(buffer.subarray(0, end))
    }
    const line = remainder.toString('utf8').trim()
    if (line) yield line
  } finally { await file.close() }
}

/** Read the active native context, not the cumulative JSONL file size or token count. */
export async function codexHistoryBytes(path: string): Promise<number> {
  const before = await stat(path)
  const cached = historyCache.get(path)
  if (cached?.size === before.size && cached.mtimeMs === before.mtimeMs) return cached.bytes
  let bytes = 0
  // Stop at the latest replacement snapshot; old images can make the entire
  // transcript hundreds of MB even when the current request is small.
  for await (const line of newestHistoryLines(path, before.size)) {
    const entry = record(JSON.parse(line))
    const payload = record(entry.payload)
    if (entry.type === 'compacted' && Array.isArray(payload.replacement_history)) {
      bytes += jsonBytes(payload.replacement_history)
      break
    } else if (entry.type === 'response_item') {
      bytes += jsonBytes(payload)
    }
  }
  const after = await stat(path)
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new Error('Codex context changed during transport preflight')
  }
  if (historyCache.size >= CACHE_LIMIT) historyCache.delete(historyCache.keys().next().value!)
  historyCache.set(path, { size: after.size, mtimeMs: after.mtimeMs, bytes })
  return bytes
}

async function trustedRolloutPath(path: unknown, options: Options): Promise<string> {
  if (typeof path !== 'string' || !options.threadId || !isAbsolute(path)) {
    throw new Error('Codex did not return a rollout path')
  }
  const home = await realpath(resolve(options.codexHome || process.env.CODEX_HOME || join(homedir(), '.codex')))
  const file = await realpath(path)
  const part = relative(home, file).split(/[\\/]/)
  if (!['sessions', 'archived_sessions'].includes(part[0] ?? '')
      || part.includes('..') || isAbsolute(relative(home, file))
      || !basename(file).endsWith(`-${options.threadId}.jsonl`)) {
    throw new Error('Codex rollout path is outside the selected auth directory')
  }
  return file
}

async function currentInputBytes(input: Json[]): Promise<number> {
  let bytes = jsonBytes(input)
  for (const item of input) {
    if (item.type === 'localImage' && typeof item.path === 'string') {
      // Native image resizing may reduce this; using the source size is conservative.
      bytes += 4 * Math.ceil((await stat(item.path)).size / 3)
    }
  }
  return bytes
}

function officialBaseUrl(value: unknown): string | undefined {
  if (value == null || value === '') return undefined
  if (typeof value !== 'string') throw new Error('Unsupported Codex base URL')
  const url = new URL(value)
  const path = url.pathname.replace(/\/$/, '')
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || !((url.hostname === 'chatgpt.com' && path === '/backend-api/codex')
        || (url.hostname === 'api.openai.com' && path === '/v1'))) {
    throw new Error('Custom Codex endpoint retains its own transport policy')
  }
  return value
}

/** Native 0.162.1 cannot override the built-in provider; use its documented
 * provider contract only for oversized first-party requests. */
export async function selectCodexTransport(options: Options, request: Request): Promise<CodexTransportSelection> {
  const config = { ...options.config }
  const configResult = await request('config/read', { cwd: options.cwd, includeLayers: false })
  const effective = record(configResult.config)
  const provider = config.model_provider ?? effective.model_provider ?? 'openai'
  if (provider !== 'openai') return { config }
  const baseUrl = officialBaseUrl(config.openai_base_url ?? effective.openai_base_url ?? process.env.OPENAI_BASE_URL)
  const expectedProvider = httpsProvider(baseUrl)
  const configuredProvider = record(effective.model_providers)[CODEX_HTTPS_PROVIDER]
    ?? record(config.model_providers)[CODEX_HTTPS_PROVIDER]
  if ((configuredProvider && !isManagedHttpsProvider(configuredProvider, expectedProvider))
      || Object.keys(config).some(key => key.startsWith(`model_providers.${CODEX_HTTPS_PROVIDER}`))) {
    throw new Error('Codex HTTPS adapter name conflicts with configured provider')
  }
  let contextBytes = await currentInputBytes(options.input) + jsonBytes(config)
  let recordedProvider: unknown
  if (options.threadId) {
    const metadata = record((await request('thread/read', { threadId: options.threadId, includeTurns: false })).thread)
    recordedProvider = metadata.modelProvider
    contextBytes += await codexHistoryBytes(await trustedRolloutPath(metadata.path, options))
  }
  if (contextBytes < CODEX_WS_CONTEXT_BUDGET_BYTES) {
    // A compaction may make the next full request small enough for WebSockets again.
    return { config, contextBytes, ...(recordedProvider === CODEX_HTTPS_PROVIDER ? { modelProvider: 'openai' } : {}) }
  }
  // Codex persists the provider id with the thread. Register the matching definition
  // in the selected CODEX_HOME so ChatGPT/Codex can reopen the thread independently.
  if (!configuredProvider) {
    await request('config/batchWrite', {
      edits: [{ keyPath: `model_providers.${CODEX_HTTPS_PROVIDER}`, mergeStrategy: 'upsert', value: expectedProvider }],
      expectedVersion: typeof configResult.version === 'string' ? configResult.version : null,
      reloadUserConfig: true,
    })
  }
  config[`model_providers.${CODEX_HTTPS_PROVIDER}`] = expectedProvider
  config.model_provider = CODEX_HTTPS_PROVIDER
  return { config, modelProvider: CODEX_HTTPS_PROVIDER, contextBytes, reason: 'large_context' }
}

/** Preflight failure is observable, but is not a model failure and never replays a turn. */
export async function prepareCodexTransport(options: Options, request: Request): Promise<CodexTransportSelection> {
  try {
    const selection = await selectCodexTransport(options, request)
    if (selection.reason) console.info(JSON.stringify({ event: 'codex_transport_selected',
      threadId: options.threadId, transport: 'https', reason: selection.reason,
      contextBytes: selection.contextBytes, budgetBytes: CODEX_WS_CONTEXT_BUDGET_BYTES }))
    return selection
  } catch (error) {
    console.warn(JSON.stringify({ event: 'codex_transport_preflight_failed', threadId: options.threadId,
      error: error instanceof SyntaxError ? 'Invalid Codex rollout JSON' : error instanceof Error ? error.message : 'Unknown preflight error' }))
    return { config: { ...options.config } }
  }
}
