import { z } from 'zod'
import { fetchMcpHttpText, type McpRequestExtra } from './mcpHttp.js'

export const discoverResourceSchema = {
  systemId: z.string().optional().describe('项目库系统 ID；未传时列出系统和资源目录，传入后查询该系统的资源关系与状态'),
}
export const executeResourceSchema = {
  bindingId: z.string().min(1).describe('discover_resources 返回的 binding.id；不是数据源 ID'),
  operation: z.enum(['TEST', 'QUERY', 'CALL']).describe('TEST 连通性；QUERY 单条只读 SQL，最多 200 行；CALL 测试应用请求'),
  sql: z.string().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']).optional(),
  path: z.string().optional().describe('已配置应用的相对路径，不接受任意目标主机'),
  params: z.record(z.string(), z.unknown()).optional(),
  bodyType: z.enum(['form', 'json']).optional(),
}
export const DISCOVER_RESOURCES_DESCRIPTION = '发现项目库系统关联的中间件、数据库和测试应用账号。仅返回元信息、能力、配置状态和引用，不返回密码。未关联资源不能执行。'
export const EXECUTE_RESOURCE_DESCRIPTION = '通过已发现的系统资源关系进行查询或测试；服务端重新校验系统、启用状态、环境与能力。数据库仅只读；应用 CALL 可能修改测试数据，须有用户授权。禁止用于生产。'

export async function resourceRequest(apiBase: string, path: string, body: unknown, extra?: McpRequestExtra) {
  try {
    const { response, text } = await fetchMcpHttpText(`${apiBase.replace(/\/+$/, '')}/api/ops/resources${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    }, extra, '系统资源')
    if (!response.ok) return { content: [{ type: 'text' as const, text: `系统资源请求失败（HTTP ${response.status}）：${text}` }], isError: true }
    const structuredContent: Record<string, unknown> = { result: JSON.parse(text) as unknown }
    return { content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }], structuredContent }
  } catch (error) {
    return { content: [{ type: 'text' as const, text: `系统资源请求失败：${error instanceof Error ? error.message : String(error)}` }], isError: true }
  }
}

export function discoverSystemResources(apiBase: string, args: { systemId?: string }, extra?: McpRequestExtra) {
  return resourceRequest(apiBase, args.systemId ? `/systems/${encodeURIComponent(args.systemId)}` : '', undefined, extra)
}

export function executeSystemResource(apiBase: string, args: z.infer<z.ZodObject<typeof executeResourceSchema>>, extra?: McpRequestExtra) {
  const { bindingId, ...call } = args
  return resourceRequest(apiBase, `/bindings/${encodeURIComponent(bindingId)}/execute`, call, extra)
}
