import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

/**
 * 「福利签收演示」专用 in-process MCP 工具：agent 改数据的唯一通道。
 *
 * 工具调用回灌到 Java 后端 {@code POST /api/claude-chat/demo/sql}，由后端在**本会话的一次性 demo 库**
 * 执行受限 SQL（仅 welfare_sign_* 表、单语句）。sidecar 不直接碰任何 SQLite 文件，库路径由后端按
 * sessionId 绑定，外部无法指定。工具名对 SDK 暴露为 {@code mcp__welfare_db__exec}。
 */
export function createWelfareDbServer(sessionId: string, apiBase: string) {
  return createSdkMcpServer({
    name: 'welfare_db',
    version: '1.0.0',
    tools: [
      tool(
        'exec',
        '在福利签收演示数据库执行一条 SQL（仅允许 welfare_sign_* 表）。SELECT 返回列与行，写操作返回影响行数。禁止多语句。',
        {
          sql: z.string().describe('单条 SQL，仅可操作 welfare_sign_* 表'),
          params: z.array(z.any()).optional().describe('参数化占位值，按顺序绑定 ?'),
        },
        async (args: { sql: string; params?: unknown[] }) => {
          try {
            const res = await fetch(`${apiBase}/api/claude-chat/demo/sql`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, sql: args.sql, params: args.params ?? [] }),
            })
            const text = await res.text()
            return { content: [{ type: 'text' as const, text }] }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            return { content: [{ type: 'text' as const, text: `welfare_db 调用失败: ${msg}` }], isError: true }
          }
        },
      ),
    ],
  })
}
