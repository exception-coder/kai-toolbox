import { tool } from '@anthropic-ai/claude-agent-sdk'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { checkSchema, confirmSchema, resolveSchema, refreshSchema, ResolutionError } from './contracts.js'
import { checkReadiness, confirmResolution, refreshIndex } from './service.js'
import { resolveWithModel, intakeRequirements, intakeSchema } from './semantic.js'
import { resolutionMetrics } from './metrics.js'
import { executionDefinitions } from '../execution/tools.js'
import { runExecutionVerification } from '../execution/verification.js'
import { reportMcpProgress, type McpRequestExtra } from '../mcpHttp.js'

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
export async function execute(name: string, input: unknown, extra?: McpRequestExtra): Promise<Record<string, unknown>> {
  try {
    const definition = definitions.find(item => item.name === name)
    if (!definition) throw new ResolutionError('TOOL_INVALID', '未知规格工具')
    if (name === 'run_execution_verification') return await runExecutionVerification(input, {
      signal: extra?.signal,
      onProgress: event => {
        const phase = { started: '开始', waiting: '运行中', output: '有输出', completed: '完成' }[event.phase]
        void reportMcpProgress(extra, event.phase === 'completed' ? event.checkIndex : event.checkIndex - 1,
          event.checkCount, `验证 ${event.checkIndex}/${event.checkCount}（${event.kind}）${phase}，已用 ${Math.round(event.elapsedMs / 1000)} 秒`)
      },
    }) as unknown as Record<string, unknown>
    return await definition.run(input) as unknown as Record<string, unknown>
  } catch (error) {
    const code = error instanceof ResolutionError ? error.code : 'CHECK_ERROR'
    return { allowed: false, code,
      message: error instanceof Error ? error.message : String(error), actions: recoveryActions(code) }
  }
}
function recoveryActions(code: string): string[] {
  if (code === 'PATH_INVALID') return ['cwd/inputFiles 可用项目相对路径或项目内绝对路径；核对具体路径、目录存在性及符号链接，禁止越界；修改参数后再试']
  if (code === 'CHECK_EXECUTABLE_NOT_FOUND') return ['使用已安装的可执行文件；Windows CLI 可传 node 与入口脚本；不要重复同一不存在的命令']
  if (code === 'GRAPH_INDEX_STALE') return ['核对范围外源码或图谱变更后重新解析和确认；旧记录重新确认以建立实现范围基线，不要求每次正常改码都刷新图谱']
  if (code === 'WORKSPACE_BUSY') return ['先 inspect_execution_writer；原会话可继续则等待，确认放弃旧执行后按查询结果 abort_execution，再绑定新执行；不要重复提交同一请求']
  if (code === 'SPEC_STORE_LEGACY_LOCK') return ['inspect_store_lock；确认旧版进程全部停止后，提供摘要、操作者及原因调用 recover_store_lock；不得手删锁或仅凭超时接管']
  if (code === 'SPEC_STORE_BUSY') return ['内部事务忙；最多有限重试，持续失败时检查受管服务状态，停止重复触发作业']
  if (code === 'EXECUTION_RELEASED') return ['旧执行已终止，重新 discover_execution → assess_execution；保留旧记录']
  if (code === 'SPEC_TARGET_CONFLICT') return ['按错误中的 capability/Requirement 身份修正分类；规格索引变化时重新 resolve_specs']
  if (code === 'DELTA_DUPLICATE') return ['合并指向同一 Requirement 的需求项，或使用不同的稳定 Requirement 标题/ID 后重新确认']
  if (code === 'DELTA_MISSING' || code === 'DELTA_CONTENT_MISMATCH') return ['仅核对本次 resolution 的 Delta 子集，按确认草稿补齐或修正文后重试']
  if (code === 'INPUT_LIMIT') return ['files 仅传项目内具体普通文件；排除目录、构建产物和超过 4 MiB 的文件后重试']
  return ['修复输入或上下文后重试；规格已变时重新 resolve_specs']
}
async function call(name: string, args: unknown, hostSessionId?: string, extra?: McpRequestExtra) {
  const bound = hostSessionId && args && typeof args === 'object'
    && ('sessionId' in args || ['resolve_specs', 'check_execution_event'].includes(name))
    ? { ...args, sessionId: hostSessionId } : args
  const result = await execute(name, bound, extra)
  const pending = name === 'run_execution_verification' && result.code === 'VERIFICATION_PENDING' && result.batchStatus === 'PASSED'
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], ...(result.allowed === false && !pending ? { isError: true } : {}) }
}
export function registerSpecResolutionTools(server: McpServer, hostSessionId?: string) {
  for (const definition of definitions) server.registerTool(definition.name, {
    description: definition.description, inputSchema: definition.schema.shape,
    annotations: { readOnlyHint: ['inspect_store_lock', 'inspect_execution_writer', 'session_init', 'resolve_execution_context', 'check_execution_event', 'check_execution_readiness', 'check_change_readiness', 'refresh_spec_index', 'get_spec_resolution_metrics'].includes(definition.name), destructiveHint: ['recover_store_lock', 'abort_execution', 'run_execution_verification'].includes(definition.name), idempotentHint: definition.name !== 'run_execution_verification' },
  }, (args: unknown, extra: unknown) => call(definition.name, args, hostSessionId, extra as McpRequestExtra))
}
export function sdkSpecResolutionTools(hostSessionId?: string) {
  return definitions.map(definition => tool(definition.name, definition.description, definition.schema.shape,
    async (args: unknown, extra: unknown) => call(definition.name, args, hostSessionId, extra as McpRequestExtra), { annotations: {
      readOnlyHint: ['inspect_store_lock', 'inspect_execution_writer', 'session_init', 'resolve_execution_context', 'check_execution_event', 'check_execution_readiness', 'check_change_readiness', 'refresh_spec_index', 'get_spec_resolution_metrics'].includes(definition.name), destructiveHint: ['recover_store_lock', 'abort_execution', 'run_execution_verification'].includes(definition.name), idempotentHint: definition.name !== 'run_execution_verification',
    } }))
}
