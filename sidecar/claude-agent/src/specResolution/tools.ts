import { tool } from '@anthropic-ai/claude-agent-sdk'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { checkSchema, confirmSchema, resolveSchema, refreshSchema, ResolutionError } from './contracts.js'
import { checkReadiness, confirmResolution, refreshIndex, resolveSpecs } from './service.js'

export const definitions = [
  { name: 'resolve_specs', schema: resolveSchema, run: resolveSpecs,
    description: '编写 OpenSpec Delta 前先调用。将用户需求原子化为独立 externalId/text/atomic=true；terms 为最多12个业务术语。返回 Requirement 全文、候选排序、Graphify 定位和版本。不要把分数当置信度；逐项判断后调用 confirm_spec_resolution。只写解析审计，不写规格。' },
  { name: 'confirm_spec_resolution', schema: confirmSchema, run: confirmResolution,
    description: '审阅 resolve_specs 候选后记录具名 Agent 决策与具体理由。改变既有行为用 MODIFIED；已有能力新增独立规则用 ADDED；全新边界用 NEW_CAPABILITY；恢复既有行为或纯实现变更用 NO_SPEC_CHANGE。歧义未解决不得调用。requirement 必须是完整 ### Requirement 区块含 Scenario；返回草稿，不写正式规格，不代表人工批准。' },
  { name: 'check_change_readiness', schema: checkSchema, run: checkReadiness,
    description: '编码或提交前检查当前 change 的解析确认、正式规格版本、完整 Delta、重复及并行目标冲突。allowed=true 不替代 OpenSpec validate、代码范围审阅或运行验收。' },
  { name: 'refresh_spec_index', schema: refreshSchema, run: refreshIndex,
    description: '从正式 OpenSpec 文件重建索引摘要，确认归档或规格同步后的版本；不修改规格，不自动将旧解析标为有效。' },
] as const
export function execute(name: string, input: unknown): Record<string, unknown> {
  try {
    const definition = definitions.find(item => item.name === name)
    if (!definition) throw new ResolutionError('TOOL_INVALID', '未知规格工具')
    return definition.run(input) as unknown as Record<string, unknown>
  } catch (error) {
    return { allowed: false, code: error instanceof ResolutionError ? error.code : 'CHECK_ERROR',
      message: error instanceof Error ? error.message : String(error), actions: ['修复输入或上下文后重试；规格已变时重新 resolve_specs'] }
  }
}
function call(name: string, args: unknown) {
  const result = execute(name, args)
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], ...(result.allowed === false ? { isError: true } : {}) }
}
export function registerSpecResolutionTools(server: McpServer) {
  for (const definition of definitions) server.registerTool(definition.name, {
    description: definition.description, inputSchema: definition.schema.shape,
    annotations: { readOnlyHint: ['check_change_readiness', 'refresh_spec_index'].includes(definition.name), destructiveHint: false, idempotentHint: true },
  }, (args: unknown) => call(definition.name, args))
}
export function sdkSpecResolutionTools() {
  return definitions.map(definition => tool(definition.name, definition.description, definition.schema.shape,
    async (args: unknown) => call(definition.name, args), { annotations: {
      readOnlyHint: ['check_change_readiness', 'refresh_spec_index'].includes(definition.name), destructiveHint: false, idempotentHint: true,
    } }))
}
