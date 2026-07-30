import { createInterface } from 'node:readline'
import { validateReadonlySql } from './readonlyPolicy.js'

type JsonRpcRequest = {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

const API_BASE = (process.env.TOOLBOX_API_BASE || '').replace(/\/+$/, '')
const DATABASES = {
  erp_db_query: '/api/claude-chat/erp-db/query',
  srm_db_query: '/api/claude-chat/srm-db/query',
  scm_db_query: '/api/claude-chat/scm-db/query',
} as const

const tools = Object.keys(DATABASES).map(name => ({
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
