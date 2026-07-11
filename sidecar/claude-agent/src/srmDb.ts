import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

/**
 * SRM 测试库（MySQL）【只读】查询 MCP：供 agent 在开发 SRM 需求时查库核对逻辑（表结构、状态字典、样本数据）。
 *
 * SQL 回灌到 Java 后端 {@code POST /api/claude-chat/srm-db/query}，后端强制 SELECT-only + 只读连接 +
 * 行数/超时上限；连接信息由用户在「SRM需求开发」里配置（建议只读账号），sidecar 不碰任何库凭据。
 * 工具名对 SDK 暴露为 {@code mcp__srm_db__query}。**只读**——绝改不了库；要改库由人走关卡确认。
 */
export function createSrmDbServer(apiBase: string) {
  return createSdkMcpServer({
    name: 'srm_db',
    version: '1.0.0',
    tools: [
      tool(
        'query',
        [
          '在 SRM 测试库（MySQL）执行一条【只读】SQL（仅 SELECT / WITH，单语句），用于核对表结构、状态字典、样本数据。',
          '禁止任何写/DDL（后端会拦截）。看表：SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE()；',
          '看列：SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_name=?（用 params 传值，占位用 ?）。',
          '返回列名+行（每格已转字符串，最多 200 行，超出会标 truncated）。',
        ].join(' '),
        {
          sql: z.string().describe('单条只读 SQL（SELECT / WITH 开头）'),
          params: z.array(z.any()).optional().describe('参数化占位值，按顺序绑定 ?'),
        },
        async (args: { sql: string; params?: unknown[] }) => {
          try {
            const res = await fetch(`${apiBase}/api/claude-chat/srm-db/query`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sql: args.sql, params: args.params ?? [] }),
            })
            const text = await res.text()
            return { content: [{ type: 'text' as const, text }] }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            return { content: [{ type: 'text' as const, text: `srm_db 调用失败: ${msg}` }], isError: true }
          }
        },
      ),
    ],
  })
}
