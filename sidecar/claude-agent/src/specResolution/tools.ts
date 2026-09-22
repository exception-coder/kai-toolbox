import { tool } from '@anthropic-ai/claude-agent-sdk'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { checkSchema, confirmSchema, resolveSchema, refreshSchema, ResolutionError } from './contracts.js'
import { checkReadiness, confirmResolution, refreshIndex } from './service.js'
import { resolveWithModel, intakeRequirements, intakeSchema } from './semantic.js'
import { resolutionMetrics } from './metrics.js'
import { executionDefinitions } from '../execution/tools.js'

export const definitions = [
  ...executionDefinitions,
  { name: 'get_spec_resolution_metrics', schema: refreshSchema, run: resolutionMetrics,
    description: '汇总项目规格解析的真实确认与纠正样本、Top3命中、自动草稿证据率及模型阶段P95。空分母返回null，不能据此宣称达到生产质量指标。' },
  { name: 'intake_spec_requirements', schema: intakeSchema, run: intakeRequirements,
    description: '把混合需求拆为原子项并逐项引用原文。模型最多等待 timeoutMs，默认4秒；失败时 Agent 自行拆分。审阅完整性后为每项补 atomic=true，调用 resolve_specs。' },
  { name: 'resolve_specs', schema: resolveSchema, run: resolveWithModel,
    description: '编写 OpenSpec Delta 前先调用。输入原子 externalId/text/atomic=true 与业务 terms。返回完整候选、Graphify 来源哈希、模型分类与高置信草稿。semantic=false 只做本地召回；默认模型4秒超时后转 Agent 审阅。sessionId 绑定宿主 Hook 会话。置信度未经生产校准；审阅后 confirm_spec_resolution。' },
  { name: 'confirm_spec_resolution', schema: confirmSchema, run: confirmResolution,
    description: '记录具名 Agent 决策与理由；implementationFiles 明确绑定项目相对路径，写前/提交前拒绝范围外文件。MODIFIED 改既有行为；ADDED 已有能力新规则；NEW_CAPABILITY 全新边界；NO_SPEC_CHANGE 恢复既有行为。歧义须先解决；requirement 为完整区块含 Scenario。返回草稿，不写正式规格，不代表人工批准。' },
  { name: 'check_change_readiness', schema: checkSchema, run: checkReadiness,
    description: '编码或提交前检查当前 change 的解析确认、正式规格版本、完整 Delta、重复及并行目标冲突。allowed=true 不替代 OpenSpec validate、代码范围审阅或运行验收。' },
  { name: 'refresh_spec_index', schema: refreshSchema, run: refreshIndex,
    description: '从正式 OpenSpec 文件重建索引摘要，确认归档或规格同步后的版本；不修改规格，不自动将旧解析标为有效。' },
] as const
export async function execute(name: string, input: unknown): Promise<Record<string, unknown>> {
  try {
    const definition = definitions.find(item => item.name === name)
    if (!definition) throw new ResolutionError('TOOL_INVALID', '未知规格工具')
    return await definition.run(input) as unknown as Record<string, unknown>
  } catch (error) {
    const code = error instanceof ResolutionError ? error.code : 'CHECK_ERROR'
    return { allowed: false, code,
      message: error instanceof Error ? error.message : String(error), actions: recoveryActions(code) }
  }
}
function recoveryActions(code: string): string[] {
  if (code === 'SPEC_TARGET_CONFLICT') return ['按错误中的 capability/Requirement 身份修正分类；规格索引变化时重新 resolve_specs']
  if (code === 'DELTA_DUPLICATE') return ['合并指向同一 Requirement 的需求项，或使用不同的稳定 Requirement 标题/ID 后重新确认']
  if (code === 'DELTA_MISSING' || code === 'DELTA_CONTENT_MISMATCH') return ['仅核对本次 resolution 的 Delta 子集，按确认草稿补齐或修正文后重试']
  if (code === 'INPUT_LIMIT') return ['files 仅传项目内具体普通文件；排除目录、构建产物和超过 4 MiB 的文件后重试']
  return ['修复输入或上下文后重试；规格已变时重新 resolve_specs']
}
async function call(name: string, args: unknown, hostSessionId?: string) {
  const bound = hostSessionId && args && typeof args === 'object'
    && ('sessionId' in args || ['resolve_specs', 'check_execution_event'].includes(name))
    ? { ...args, sessionId: hostSessionId } : args
  const result = await execute(name, bound)
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], ...(result.allowed === false ? { isError: true } : {}) }
}
export function registerSpecResolutionTools(server: McpServer, hostSessionId?: string) {
  for (const definition of definitions) server.registerTool(definition.name, {
    description: definition.description, inputSchema: definition.schema.shape,
    annotations: { readOnlyHint: ['session_init', 'resolve_execution_context', 'check_execution_event', 'check_execution_readiness', 'check_change_readiness', 'refresh_spec_index', 'get_spec_resolution_metrics'].includes(definition.name), destructiveHint: definition.name === 'run_execution_verification', idempotentHint: definition.name !== 'run_execution_verification' },
  }, (args: unknown) => call(definition.name, args, hostSessionId))
}
export function sdkSpecResolutionTools(hostSessionId?: string) {
  return definitions.map(definition => tool(definition.name, definition.description, definition.schema.shape,
    async (args: unknown) => call(definition.name, args, hostSessionId), { annotations: {
      readOnlyHint: ['session_init', 'resolve_execution_context', 'check_execution_event', 'check_execution_readiness', 'check_change_readiness', 'refresh_spec_index', 'get_spec_resolution_metrics'].includes(definition.name), destructiveHint: definition.name === 'run_execution_verification', idempotentHint: definition.name !== 'run_execution_verification',
    } }))
}
