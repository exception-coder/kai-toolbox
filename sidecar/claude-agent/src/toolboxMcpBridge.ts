import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

type ServerName = 'forge' | 'erp_db' | 'erp_app' | 'srm_db' | 'srm_app' | 'scm_db'

const serverName = process.argv[2] as ServerName | undefined
const apiBase = process.env.TOOLBOX_API_BASE?.replace(/\/+$/, '')
const sessionId = process.env.TOOLBOX_SESSION_ID?.trim()

if (!serverName || !['forge', 'erp_db', 'erp_app', 'srm_db', 'srm_app', 'scm_db'].includes(serverName)) {
  throw new Error('缺少或不支持的 kai-toolbox MCP server 名称')
}
if (!apiBase) {
  throw new Error('缺少 TOOLBOX_API_BASE，无法回灌 kai-toolbox 后端')
}
if (serverName === 'forge' && !sessionId) {
  throw new Error('缺少 TOOLBOX_SESSION_ID，无法关联当前会话的待执行 SQL')
}

const server = new McpServer(
  { name: serverName, version: '1.0.0' },
  {
    instructions: [
      '这是 kai-toolbox 提供的本地开发验证工具。数据库工具仅允许查询测试库且由后端强制只读；',
      '应用探测工具仅允许访问已配置的本地或测试实例，禁止生产环境。',
    ].join(''),
  },
)

async function post(path: string, body: unknown): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    const response = await fetch(`${apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await response.text()
    return {
      content: [{ type: 'text', text }],
      ...(response.ok ? {} : { isError: true }),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { content: [{ type: 'text', text: `${serverName} 调用失败: ${message}` }], isError: true }
  }
}

const querySchema = {
  sql: z.string().describe('单条只读 SQL（仅 SELECT / WITH）'),
  params: z.array(z.any()).optional().describe('按顺序绑定到 ? 占位符的参数'),
}

if (serverName === 'forge') {
  server.registerTool('register_pending_sql', {
    description: [
      '把当前开发会话新建或实质修改的 DDL/DML 登记到 Forge“待执行 SQL”台账。生成数据库变更后必须调用。',
      '只登记、绝不执行数据库；不要登记 SELECT/WITH 诊断查询；禁止包含密码、Token 或连接凭据。',
    ].join(' '),
    inputSchema: {
      title: z.string().optional().describe('简短登记标题'),
      targetEnvironment: z.string().optional().describe('目标库或环境，不确定可留空'),
      changeType: z.enum(['DDL', 'DML', 'MIXED']).default('MIXED'),
      sqlText: z.string().describe('完整、可交付人工执行的 DDL/DML SQL'),
      mode: z.enum(['append', 'replace']).default('append'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, ({ title, targetEnvironment, changeType, sqlText, mode }) => post(
    `/api/claude-chat/sessions/${encodeURIComponent(sessionId!)}/pending-sql/auto-register`,
    { title, targetEnvironment, changeType, sqlText, mode },
  ))
} else if (serverName === 'erp_db') {
  server.registerTool('query', {
    description: '在 ERP 测试 Oracle 库执行只读 SQL，用于核对表结构、状态字典和样本数据。禁止写入或 DDL，最多返回 200 行。',
    inputSchema: querySchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, ({ sql, params }) => post('/api/claude-chat/erp-db/query', { sql, params: params ?? [] }))
} else if (serverName === 'srm_db') {
  server.registerTool('query', {
    description: '在 SRM 测试 MySQL 库执行只读 SQL，用于核对表结构、状态字典和样本数据。禁止写入或 DDL，最多返回 200 行。',
    inputSchema: querySchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, ({ sql, params }) => post('/api/claude-chat/srm-db/query', { sql, params: params ?? [] }))
} else if (serverName === 'scm_db') {
  server.registerTool('query', {
    description: '在 SCM 测试 MySQL 库执行只读 SQL，用于核对表结构、状态字典和样本数据。禁止写入或 DDL，最多返回 200 行。',
    inputSchema: querySchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, ({ sql, params }) => post('/api/claude-chat/scm-db/query', { sql, params: params ?? [] }))
} else {
  const isErp = serverName === 'erp_app'
  server.registerTool('http_call', {
    description: isErp
      ? '对已配置的本地/测试 ERP 实例发起带登录态的 HTTP 请求，用于自闭环验证；仅允许同源测试实例，生产域会被后端拒绝。'
      : '对已配置的本地/测试 SRM 实例发起带登录态的 HTTP 请求，用于自闭环验证；仅允许同源测试实例，生产域会被后端拒绝。',
    inputSchema: {
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET'),
      path: z.string().describe('相对实例 baseUrl 的路径或同源绝对 URL'),
      params: z.record(z.string(), z.any()).optional(),
      bodyType: z.enum(['form', 'json']).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  }, ({ method, path, params, bodyType }) => post(
    isErp ? '/api/claude-chat/erp-app/call' : '/api/claude-chat/srm-app/call',
    {
      method: method ?? 'GET',
      path,
      params: params ?? {},
      bodyType: bodyType ?? (isErp ? 'form' : 'json'),
    },
  ))
}

await server.connect(new StdioServerTransport())
