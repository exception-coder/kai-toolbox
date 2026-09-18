import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { sdkSpecResolutionTools } from './specResolution/tools.js'
import { discoverResourceSchema, executeResourceSchema, DISCOVER_RESOURCES_DESCRIPTION, EXECUTE_RESOURCE_DESCRIPTION, discoverSystemResources, executeSystemResource } from './systemResourceTools.js'
import {
  FORGE_PENDING_SQL_STEER,
  FORGE_PENDING_SQL_TOOL_DESCRIPTION,
  FORGE_SQL_CONTEXT_TOOL_DESCRIPTION,
} from './pendingSqlPolicy.js'
import { fetchMcpHttpText, type McpRequestExtra } from './mcpHttp.js'

const pendingSqlTargetSchema = z.object({
  targetKey: z.string().optional().describe('稳定目标标识；已知 Forge 数据源时可传 datasource:<id>'),
  datasourceId: z.string().optional().describe('“系统资源与测试账号”中的数据源 ID；未知可不传'),
  targetEnvironment: z.string().describe('目标库或环境，例如“ERP 测试库 · Oracle”'),
  changeType: z.enum(['DDL', 'DML', 'MIXED']).default('MIXED'),
  sqlText: z.string().describe('该目标库独立执行的完整 DDL/DML'),
})

export { FORGE_PENDING_SQL_STEER } from './pendingSqlPolicy.js'

/** Forge 交付工具；受限咨询模式仅保留既有证据与登记能力。 */
export function createForgePendingSqlServer(sessionId: string, apiBase: string, includeDeliveryTools = true) {
  return createSdkMcpServer({
    name: 'forge',
    version: '1.0.0',
    tools: [
      ...(includeDeliveryTools ? sdkSpecResolutionTools(sessionId) : []),
      ...(includeDeliveryTools ? [tool('discover_resources', DISCOVER_RESOURCES_DESCRIPTION, discoverResourceSchema,
        (args, extra) => discoverSystemResources(apiBase, args, extra as McpRequestExtra),
        { annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } }),
      tool('execute_resource', EXECUTE_RESOURCE_DESCRIPTION, executeResourceSchema,
        (args, extra) => executeSystemResource(apiBase, args, extra as McpRequestExtra),
        { annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false } })] : []),
      tool(
        'prepare_sql_context',
        FORGE_SQL_CONTEXT_TOOL_DESCRIPTION,
        {
          purpose: z.string().describe('本次 SQL 对应的业务功能和变更目的'),
          tables: z.array(z.string()).min(1).max(50).describe('将被 DDL/DML 直接读写或变更的目标表名'),
          project: z.string().optional().describe('仅在 PROJECT_AMBIGUOUS 时，从 candidateProjects 中选择后重试'),
        },
        async (args: { purpose: string; tables: string[]; project?: string }, rawExtra: unknown) => {
          try {
            const { response, text } = await fetchMcpHttpText(
              `${apiBase}/api/claude-chat/sessions/${encodeURIComponent(sessionId)}/pending-sql/prepare-context`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(args),
              },
              rawExtra as McpRequestExtra,
              '准备 SQL DDL 证据',
            )
            return {
              content: [{ type: 'text' as const, text }],
              ...(response.ok ? {} : { isError: true }),
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return {
              content: [{ type: 'text' as const, text: `Forge DDL 证据读取失败：${message}` }],
              isError: true,
            }
          }
        },
      ),
      tool(
        'register_pending_sql',
        FORGE_PENDING_SQL_TOOL_DESCRIPTION,
        {
          title: z.string().optional().describe('业务化标题，例如“SRM 纱线报价推送补充重试记录表”；首次登记或 replace 时必须提供'),
          targetEnvironment: z.string().optional().describe('单库兼容字段；多库任务优先使用 targets'),
          changeType: z.enum(['DDL', 'DML', 'MIXED']).default('MIXED'),
          sqlText: z.string().optional().describe('单库兼容字段；多库任务优先使用 targets'),
          targets: z.array(pendingSqlTargetSchema).min(1).max(16).optional()
            .describe('涉及多个库时按目标库分别登记；Forge 会额外生成一份只读汇总 SQL'),
          mode: z.enum(['append', 'replace']).default('append')
            .describe('分批补充用 append；重写整份登记用 replace'),
          ddlEvidenceId: z.string().optional().describe('prepare_sql_context 返回的 evidenceId；未传或非 VERIFIED 仍可登记为待复核 SQL'),
        },
        async (args: {
          title?: string
          targetEnvironment?: string
          changeType?: 'DDL' | 'DML' | 'MIXED'
          sqlText?: string
          targets?: Array<{
            targetKey?: string
            datasourceId?: string
            targetEnvironment: string
            changeType?: 'DDL' | 'DML' | 'MIXED'
            sqlText: string
          }>
          mode?: 'append' | 'replace'
          ddlEvidenceId?: string
        }, rawExtra: unknown) => {
          try {
            const { response, text } = await fetchMcpHttpText(
              `${apiBase}/api/claude-chat/sessions/${encodeURIComponent(sessionId)}/pending-sql/auto-register`,
              {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: args.title,
                  targetEnvironment: args.targetEnvironment,
                  changeType: args.changeType ?? 'MIXED',
                  sqlText: args.sqlText,
                  targets: args.targets,
                  mode: args.mode ?? 'append',
                  ddlEvidenceId: args.ddlEvidenceId,
                }),
              },
              rawExtra as McpRequestExtra,
              '登记待执行 SQL',
            )
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
      tool(
        'report_session_progress',
        '向 Forge Runtime 报告当前自动监督轮次的候选处置；运行身份由服务端会话绑定，工具本身不会启动下一轮或宣告整个目标完成。',
        {
          disposition: z.enum(['CONTINUE', 'COMPLETE', 'WAITING_USER', 'BLOCKED', 'FAILED']),
          summary: z.string().max(2000),
          nextAction: z.string().max(2000).optional(),
          remainingWork: z.array(z.string().max(500)).max(20).default([]),
          evidence: z.array(z.string().max(500)).max(20).default([]),
          reason: z.string().max(2000).optional(),
        },
        async (args: {
          disposition: 'CONTINUE' | 'COMPLETE' | 'WAITING_USER' | 'BLOCKED' | 'FAILED'
          summary: string
          nextAction?: string
          remainingWork?: string[]
          evidence?: string[]
          reason?: string
        }, rawExtra: unknown) => {
          try {
            const { response, text } = await fetchMcpHttpText(
              `${apiBase}/api/claude-chat/sessions/${encodeURIComponent(sessionId)}/autopilot/progress`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(args),
              },
              rawExtra as McpRequestExtra,
              '上报会话自动监督进度',
            )
            return { content: [{ type: 'text' as const, text }], ...(response.ok ? {} : { isError: true }) }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return {
              content: [{ type: 'text' as const, text: `Forge 自动监督进度上报失败：${message}` }],
              isError: true,
            }
          }
        },
      ),
    ],
  })
}
