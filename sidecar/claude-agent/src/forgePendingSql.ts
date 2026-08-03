import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

export const FORGE_PENDING_SQL_STEER = [
  '【Forge 待执行 SQL 登记规则】',
  '当你为当前开发任务新建或实质修改可执行的数据库 DDL/DML 时，必须在最终回复前调用 forge.register_pending_sql，登记完整 SQL。',
  '只登记，不执行数据库；SELECT/WITH 等纯诊断查询不要登记；SQL 中禁止包含密码、Token 或连接凭据。',
  '同一任务分批产生 SQL 时使用 append；重写整份脚本时使用 replace。没有数据库变更时不要调用。',
].join('\n')

/** Forge 本地台账 MCP：只把 SQL 回灌到当前会话的待执行登记，不连接任何目标数据库。 */
export function createForgePendingSqlServer(sessionId: string, apiBase: string) {
  return createSdkMcpServer({
    name: 'forge',
    version: '1.0.0',
    tools: [
      tool(
        'register_pending_sql',
        [
          '把当前开发会话产生的数据库变更 SQL 登记到 Forge“待执行 SQL”台账。',
          '生成或实质修改 DDL/DML 后必须调用；此工具只登记、绝不执行数据库。',
          '不要登记 SELECT/WITH 诊断查询，不要传密码、Token、连接串等凭据。',
        ].join(' '),
        {
          title: z.string().optional().describe('简短登记标题，例如“新增报价推送记录表”'),
          targetEnvironment: z.string().optional().describe('目标库或环境，例如“SRM 测试库”；不确定可留空'),
          changeType: z.enum(['DDL', 'DML', 'MIXED']).default('MIXED'),
          sqlText: z.string().describe('完整、可交付人工执行的 DDL/DML SQL'),
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
