import { tool } from '@anthropic-ai/claude-agent-sdk'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { checkSchema, confirmSchema, resolveSchema, refreshSchema, ResolutionError } from './contracts.js'
import { checkReadiness, confirmResolution, refreshIndex } from './service.js'
import { resolveWithModel, intakeRequirements, intakeSchema } from './semantic.js'
import { resolutionMetrics } from './metrics.js'
import { discoverExecutionSchema, assessExecutionSchema, executionCheckSchema, executionContextSchema, runExecutionSchema } from './executionContracts.js'
import { discoverExecution, assessExecution, checkExecution, finishExecution } from './execution.js'
import { runExecutionVerification } from './executionVerification.js'

export const definitions = [
  { name: 'discover_execution', schema: discoverExecutionSchema, run: discoverExecution,
    description: '修改前先探索：无需 changeId，返回既有 Requirement 原文、活跃 changes、Graphify 证据和版本。files 为本批次精确项目相对路径。读取原文后 assess_execution；未命中不能直接新建能力。' },
  { name: 'assess_execution', schema: assessExecutionSchema, run: assessExecution,
    description: '具名审阅行为/设计影响及原文引用，绑定会话共享分支和单写入者。behavior=preserved 无需 OpenSpec；changed 先复用/建立相关 change，再走 resolve_specs。风险只增加验证要求，设计按 none/detail/architecture 独立判定。不得把未知填成 preserved。' },
  { name: 'check_execution_readiness', schema: executionCheckSchema, run: checkExecution,
    description: '检查执行会话、当前分支、规格版本和文件范围；拒绝自行切换/创建分支、worktree。提交前检查真实暂存区、适用设计更新及实际验证证据。无需 Change 的执行也使用此入口。' },
  { name: 'run_execution_verification', schema: runExecutionSchema, run: runExecutionVerification,
    description: '实际执行已授权的测试 executable + argv（无Shell），按影响检查 regression/api/sql/ui/spec/design 覆盖；保存退出码和输入内容摘要。inputFiles 必须包含测试、配置与相关依赖。禁止用此入口部署/重启或伪造空检查；kind/purpose 的语义覆盖需要审阅。超时默认60秒，最多120秒。' },
  { name: 'finish_execution', schema: executionContextSchema, run: finishExecution,
    description: '确认本批次验证及提交后释放共享工作区写入权。先逐任务原子提交，不自动提交、建分支或归档 OpenSpec；无需 Change 的执行可直接结束。' },
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
    return { allowed: false, code: error instanceof ResolutionError ? error.code : 'CHECK_ERROR',
      message: error instanceof Error ? error.message : String(error), actions: ['修复输入或上下文后重试；规格已变时重新 resolve_specs'] }
  }
}
async function call(name: string, args: unknown, hostSessionId?: string) {
  const bound = hostSessionId && args && typeof args === 'object' && ('sessionId' in args || name === 'resolve_specs')
    ? { ...args, sessionId: hostSessionId } : args
  const result = await execute(name, bound)
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], ...(result.allowed === false ? { isError: true } : {}) }
}
export function registerSpecResolutionTools(server: McpServer, hostSessionId?: string) {
  for (const definition of definitions) server.registerTool(definition.name, {
    description: definition.description, inputSchema: definition.schema.shape,
    annotations: { readOnlyHint: ['check_execution_readiness', 'check_change_readiness', 'refresh_spec_index', 'get_spec_resolution_metrics'].includes(definition.name), destructiveHint: definition.name === 'run_execution_verification', idempotentHint: definition.name !== 'run_execution_verification' },
  }, (args: unknown) => call(definition.name, args, hostSessionId))
}
export function sdkSpecResolutionTools(hostSessionId?: string) {
  return definitions.map(definition => tool(definition.name, definition.description, definition.schema.shape,
    async (args: unknown) => call(definition.name, args, hostSessionId), { annotations: {
      readOnlyHint: ['check_execution_readiness', 'check_change_readiness', 'refresh_spec_index', 'get_spec_resolution_metrics'].includes(definition.name), destructiveHint: definition.name === 'run_execution_verification', idempotentHint: definition.name !== 'run_execution_verification',
    } }))
}
