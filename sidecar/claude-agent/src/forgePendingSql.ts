import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import {
  FORGE_PENDING_SQL_STEER,
  FORGE_PENDING_SQL_TOOL_DESCRIPTION,
} from './pendingSqlPolicy.js'

export { FORGE_PENDING_SQL_STEER } from './pendingSqlPolicy.js'

/** Forge 本地台账 MCP：只把 SQL 回灌到当前会话的待执行登记，不连接任何目标数据库。 */
export function createForgePendingSqlServer(sessionId: string, apiBase: string) {
  return createSdkMcpServer({
    name: 'forge',
    version: '1.0.0',
    tools: [
      tool(
        'register_pending_sql',
        FORGE_PENDING_SQL_TOOL_DESCRIPTION,
        {
          title: z.string().optional().describe('业务化标题，例如“SRM 纱线报价推送补充重试记录表”；首次登记或 replace 时必须提供'),
          targetEnvironment: z.string().optional().describe('目标库或环境，例如“SRM 测试库”；不确定可留空'),
          changeType: z.enum(['DDL', 'DML', 'MIXED']).default('MIXED'),
          sqlText: z.string().describe('完整、可交付人工执行的 DDL/DML；每个逻辑块前须有“-- 功能：...；变更：...；目的：...”注释'),
          mode: z.enum(['append', 'replace']).default('append')
            .describe('分批补充用 append；重写整份登记用 replace'),
        },
        async (args: {
          title?: string
          targetEnvironment?: string
          changeType?: 'DDL' | 'DML' | 'MIXED'
          sqlText: string
          mode?: 'append' | 'replace'
        }) => {
          try {
            const response = await fetch(
              `${apiBase}/api/claude-chat/sessions/${encodeURIComponent(sessionId)}/pending-sql/auto-register`,
              {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: args.title,
                  targetEnvironment: args.targetEnvironment,
                  changeType: args.changeType ?? 'MIXED',
                  sqlText: args.sqlText,
                  mode: args.mode ?? 'append',
                }),
              },
            )
            const text = await response.text()
            return {
              content: [{ type: 'text' as const, text: response.ok
                ? `已登记到当前会话的待执行 SQL 台账。\n${text}`
                : text }],
              ...(response.ok ? {} : { isError: true }),
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return {
              content: [{ type: 'text' as const, text: `Forge 待执行 SQL 登记失败：${message}` }],
              isError: true,
            }
          }
        },
      ),
    ],
  })
}
