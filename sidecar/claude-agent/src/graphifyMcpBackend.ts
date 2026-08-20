import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import {
  GraphifyBackendError,
  type GraphifyBackend,
  type GraphifyBackendSnapshot,
  type GraphifyRuntimeQuery,
} from './graphifyRuntimeTypes.js'

const STARTUP_TIMEOUT_MS = 12_000
const STARTUP_COOLDOWN_MS = 30_000
const FAILURE_RESTART_THRESHOLD = 3

type RuntimeConnection = {
  client: Client
  transport: StdioClientTransport
  python: string
}

export function graphifyPythonCandidates(projectPath: string): string[] {
  const explicit = process.env.GRAPHIFY_PYTHON?.trim()
  const uvManaged = process.platform === 'win32'
    ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'uv', 'tools', 'graphifyy', 'Scripts', 'python.exe')
    : path.join(os.homedir(), '.local', 'share', 'uv', 'tools', 'graphifyy', 'bin', 'python')
  const marker = path.join(projectPath, 'graphify-out', '.graphify_python')
  const marked = readOptionalMarker(marker)
  const localVenv = process.platform === 'win32'
    ? path.join(os.homedir(), '.venvs', 'graphifyy', 'Scripts', 'python.exe')
    : path.join(os.homedir(), '.venvs', 'graphifyy', 'bin', 'python')

  // The uv tool environment is the canonical Graphify installation and is usually better tested
  // than the interpreter recorded while generating one project. GRAPHIFY_PYTHON remains the
  // explicit escape hatch for project-specific deployments.
  return [...new Set([explicit, uvManaged, marked, localVenv].filter((candidate): candidate is string => Boolean(
    candidate && existsSync(candidate),
  )))]
}

function readOptionalMarker(marker: string): string {
  try {
    return existsSync(marker) ? readFileSync(marker, 'utf8').trim() : ''
  } catch {
    return ''
  }
}

export function extractGraphifyTextContent(result: unknown): string {
  if (!result || typeof result !== 'object') throw new GraphifyBackendError('query', 'Graphify MCP 返回格式无效')
  const record = result as { content?: unknown; isError?: unknown }
  const blocks = Array.isArray(record.content) ? record.content : []
  const text = blocks
    .filter((block): block is { type: 'text'; text: string } => Boolean(
      block && typeof block === 'object'
      && (block as { type?: unknown }).type === 'text'
      && typeof (block as { text?: unknown }).text === 'string',
    ))
    .map(block => block.text.trim())
    .filter(Boolean)
    .join('\n')
  if (record.isError === true) throw new GraphifyBackendError('query', text || 'Graphify MCP 查询失败')
  if (!text) throw new GraphifyBackendError('query', 'Graphify MCP 未返回文本上下文')
  return text
}

export class McpGraphifyBackend implements GraphifyBackend {
  private connection: RuntimeConnection | null = null
  private starting: Promise<RuntimeConnection> | null = null
  private state: GraphifyBackendSnapshot['state'] = 'STOPPED'
  private unavailableUntil = 0
  private consecutiveFailures = 0
  private lastError = ''

  async query(input: Required<GraphifyRuntimeQuery>, timeoutMs: number): Promise<string> {
    const connection = await this.ensureStarted(input.projectPath)
    try {
      const result = await connection.client.callTool({
        name: 'query_graph',
        arguments: {
          project_path: input.projectPath,
          question: input.question,
          mode: input.mode,
          token_budget: input.tokenBudget,
        },
      }, undefined, { timeout: timeoutMs })
      this.consecutiveFailures = 0
      this.lastError = ''
      this.state = 'READY'
      return extractGraphifyTextContent(result)
    } catch (error) {
      const classified = classifyBackendError(error)
      this.consecutiveFailures += 1
      this.lastError = classified.message
      this.state = 'DEGRADED'
      const mustRestart = classified.kind === 'transport'
        || this.consecutiveFailures >= FAILURE_RESTART_THRESHOLD
      if (mustRestart) await this.close(`backend-${classified.kind}`)
      throw classified
    }
  }

  snapshot(): GraphifyBackendSnapshot {
    return {
      state: this.state,
      pid: this.connection?.transport.pid ?? null,
      python: this.connection?.python,
      consecutiveFailures: this.consecutiveFailures,
      lastError: this.lastError || undefined,
    }
  }

  async close(reason = 'shutdown'): Promise<void> {
    if (!this.connection && this.starting) await this.starting.catch(() => undefined)
    const connection = this.connection
    this.connection = null
    this.state = 'STOPPED'
    if (!connection) return
    console.log(`[graphify-backend] closing reason=${reason} pid=${connection.transport.pid ?? '-'}`)
    await connection.transport.close().catch(() => undefined)
  }

  private async ensureStarted(projectPath: string): Promise<RuntimeConnection> {
    if (this.connection) return this.connection
    if (this.starting) return this.starting
    if (Date.now() < this.unavailableUntil) {
      throw new GraphifyBackendError('startup', this.lastError || 'Graphify 后端处于启动冷却期')
    }
    this.state = 'STARTING'
    this.starting = this.start(projectPath).finally(() => { this.starting = null })
    try {
      return await this.starting
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.lastError = message
      this.state = 'DEGRADED'
      this.unavailableUntil = Date.now() + STARTUP_COOLDOWN_MS
      throw error
    }
  }

  private async start(projectPath: string): Promise<RuntimeConnection> {
    const candidates = graphifyPythonCandidates(projectPath)
    if (!candidates.length) throw new GraphifyBackendError('startup', '未找到 Graphify Python；可配置 GRAPHIFY_PYTHON')
    const failures: string[] = []
    for (const python of candidates) {
      try {
        return await this.connect(python)
      } catch (error) {
        failures.push(`${python}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    throw new GraphifyBackendError('startup', `Graphify MCP 启动失败：${failures.join('；')}`)
  }

  private async connect(python: string): Promise<RuntimeConnection> {
    const missingDefaultGraph = path.join(os.tmpdir(), 'kai-toolbox-graphify-runtime', 'missing-graph.json')
    const transport = new StdioClientTransport({
      command: python,
      args: ['-m', 'graphify.serve', missingDefaultGraph],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' } as Record<string, string>,
      stderr: 'pipe',
    })
    transport.stderr?.on('data', chunk => {
      const line = String(chunk).trim()
      if (line) console.error(`[graphify-backend] ${line}`)
    })
    const client = new Client({ name: 'kai-toolbox-graphify-runtime', version: '2.0.0' }, { capabilities: {} })
    try {
      await client.connect(transport, { timeout: STARTUP_TIMEOUT_MS })
      const connection = { client, transport, python }
      client.onclose = () => {
        if (this.connection === connection) {
          this.connection = null
          this.state = 'DEGRADED'
          this.lastError = 'Graphify MCP 连接已关闭'
        }
      }
      client.onerror = error => {
        this.lastError = error.message
        this.state = 'DEGRADED'
      }
      this.connection = connection
      this.unavailableUntil = 0
      this.consecutiveFailures = 0
      this.lastError = ''
      this.state = 'READY'
      console.log(`[graphify-backend] ready pid=${transport.pid ?? '-'} python=${python}`)
      return connection
    } catch (error) {
      await transport.close().catch(() => undefined)
      throw error
    }
  }
}

function classifyBackendError(error: unknown): GraphifyBackendError {
  if (error instanceof GraphifyBackendError) return error
  const message = error instanceof Error ? error.message : String(error)
  if (/timeout|timed out|超时/i.test(message)) return new GraphifyBackendError('timeout', message, error)
  if (/closed|transport|econn|epipe|spawn|exited|not connected/i.test(message)) {
    return new GraphifyBackendError('transport', message, error)
  }
  return new GraphifyBackendError('query', message, error)
}
