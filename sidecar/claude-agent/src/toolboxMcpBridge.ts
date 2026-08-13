import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  FORGE_PENDING_SQL_TOOL_DESCRIPTION,
  FORGE_SQL_CONTEXT_TOOL_DESCRIPTION,
} from './pendingSqlPolicy.js'
import { fetchMcpHttpText, type McpRequestExtra } from './mcpHttp.js'

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

async function request(path: string, body: unknown, method: 'POST' | 'PUT', extra: McpRequestExtra | undefined,
                       operation: string):
  Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    const { response, text, elapsedMs } = await fetchMcpHttpText(`${apiBase}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, extra, operation)
    return {
      content: [{
        type: 'text',
        text: response.ok ? text : `${operation}失败（HTTP ${response.status}，${elapsedMs}ms）：${text}`,
      }],
      ...(response.ok ? {} : { isError: true }),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const cancelled = extra?.signal?.aborted
    return { content: [{ type: 'text', text: `${operation}${cancelled ? '已取消' : '失败'}：${message}` }], isError: true }
  }
}

const querySchema = {
  sql: z.string().describe('单条只读 SQL（仅 SELECT / WITH）'),
  params: z.array(z.any()).optional().describe('按顺序绑定到 ? 占位符的参数'),
}

if (serverName === 'forge') {
  server.registerTool('prepare_sql_context', {
    description: FORGE_SQL_CONTEXT_TOOL_DESCRIPTION,
    inputSchema: {
      purpose: z.string().describe('本次 SQL 对应的业务功能和变更目的'),
      tables: z.array(z.string()).min(1).max(50).describe('将被 DDL/DML 直接读写或变更的目标表名'),
      project: z.string().optional().describe('仅在 PROJECT_AMBIGUOUS 时，从 candidateProjects 中选择后重试'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, ({ purpose, tables, project }, extra) => request(
    `/api/claude-chat/sessions/${encodeURIComponent(sessionId!)}/pending-sql/prepare-context`,
    { purpose, tables, project }, 'POST', extra, '准备 SQL DDL 证据',
  ))

  server.registerTool('register_pending_sql', {
    description: FORGE_PENDING_SQL_TOOL_DESCRIPTION,
    inputSchema: {
      title: z.string().optional().describe('关联具体系统、模块和业务功能的标题；首次登记或 replace 时必须提供'),
      targetEnvironment: z.string().optional().describe('目标库或环境，不确定可留空'),
      changeType: z.enum(['DDL', 'DML', 'MIXED']).default('MIXED'),
      sqlText: z.string().describe('完整、可交付人工执行的 DDL/DML；每个逻辑块前须有“-- 功能：...；变更：...；目的：...”注释'),
      mode: z.enum(['append', 'replace']).default('append'),
      ddlEvidenceId: z.string().optional().describe('prepare_sql_context 返回的 evidenceId'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, ({ title, targetEnvironment, changeType, sqlText, mode, ddlEvidenceId }, extra) => request(
    `/api/claude-chat/sessions/${encodeURIComponent(sessionId!)}/pending-sql/auto-register`,
    { title, targetEnvironment, changeType, sqlText, mode, ddlEvidenceId },
    'PUT', extra, '登记待执行 SQL',
  ))
} else if (serverName === 'erp_db') {
  server.registerTool('query', {
    description: '在 ERP 测试 Oracle 库执行只读 SQL，用于核对表结构、状态字典和样本数据。禁止写入或 DDL，最多返回 200 行。',
    inputSchema: querySchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, ({ sql, params }, extra) => request(
    '/api/claude-chat/erp-db/query', { sql, params: params ?? [] }, 'POST', extra, '查询 ERP 测试库',
  ))
} else if (serverName === 'srm_db') {
  server.registerTool('query', {
    description: '在 SRM 测试 MySQL 库执行只读 SQL，用于核对表结构、状态字典和样本数据。禁止写入或 DDL，最多返回 200 行。',
    inputSchema: querySchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, ({ sql, params }, extra) => request(
    '/api/claude-chat/srm-db/query', { sql, params: params ?? [] }, 'POST', extra, '查询 SRM 测试库',
  ))
} else if (serverName === 'scm_db') {
  server.registerTool('query', {
    description: '在 SCM 测试 MySQL 库执行只读 SQL，用于核对表结构、状态字典和样本数据。禁止写入或 DDL，最多返回 200 行。',
    inputSchema: querySchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, ({ sql, params }, extra) => request(
    '/api/claude-chat/scm-db/query', { sql, params: params ?? [] }, 'POST', extra, '查询 SCM 测试库',
  ))
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
  }, ({ method, path, params, bodyType }, extra) => request(
    isErp ? '/api/claude-chat/erp-app/call' : '/api/claude-chat/srm-app/call',
    {
      method: method ?? 'GET',
      path,
      params: params ?? {},
      bodyType: bodyType ?? (isErp ? 'form' : 'json'),
    }, 'POST', extra, isErp ? '验证 ERP 测试站点' : '验证 SRM 测试站点',
  ))
}

await server.connect(new StdioServerTransport())
