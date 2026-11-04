import { pagePreviewSchema, PAGE_PREVIEW_DESCRIPTION, preparePagePreview } from './pagePreviewTools.js'
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { discoverResourceSchema, executeResourceSchema, DISCOVER_RESOURCES_DESCRIPTION, EXECUTE_RESOURCE_DESCRIPTION, discoverSystemResources, executeSystemResource } from './systemResourceTools.js'
import {
  FORGE_PENDING_SQL_STEER,
  FORGE_SQL_CONTEXT_TOOL_DESCRIPTION,
} from './pendingSqlPolicy.js'
import { fetchMcpHttpText, type McpRequestExtra } from './mcpHttp.js'

export { FORGE_PENDING_SQL_STEER } from './pendingSqlPolicy.js'

/** Forge 交付工具；受限咨询模式仅保留既有证据与进度能力。 */
export function createForgePendingSqlServer(sessionId: string, apiBase: string, includeDeliveryTools = true) {
  return createSdkMcpServer({
    name: 'forge',
    version: '1.0.0',
    tools: [
      ...(includeDeliveryTools ? [tool('prepare_page_preview', PAGE_PREVIEW_DESCRIPTION, pagePreviewSchema,
        async args => preparePagePreview(args, sessionId),
        { annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } }),
      tool('discover_resources', DISCOVER_RESOURCES_DESCRIPTION, discoverResourceSchema,
        (args, extra) => discoverSystemResources(apiBase, args, extra as McpRequestExtra),
        { annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } }),
      tool('execute_resource', EXECUTE_RESOURCE_DESCRIPTION, executeResourceSchema,
        (args, extra) => executeSystemResource(apiBase, args, extra as McpRequestExtra, sessionId),
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
