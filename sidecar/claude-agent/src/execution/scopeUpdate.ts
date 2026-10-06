import { requireCondition } from '../specResolution/contracts.js'
import { executionScopes } from './writers.js'
import { fileDigest } from './repository.js'
import type { Execution } from './service.js'
import type { Discovery } from './context.js'
import type { Assessment } from './contracts.js'

/** Called inside the writer transaction after checking all proposed claims for conflicts. */
export function updateExecutionScope(active: Execution, discovery: Discovery, input: Assessment, policy: Execution['policy']): Execution {
  requireCondition(input.update, 'EXECUTION_UPDATE_REQUIRED',
    `本会话旧执行 ${active.executionId}（范围：${executionScopes(active.project, active.discovery.files).join(", ")}）；同任务增补请先 inspect_execution_writer，重新 discover 完整文件，再 assess_execution 携带 update.executionId 和 update.expectedRevision；不要中止或重复原请求`)
  requireCondition(input.update.executionId === active.executionId && input.update.expectedRevision === (active.scopeHistory?.length ?? 0),
    'EXECUTION_CONTEXT_MISMATCH', '执行范围版本已变化；重新查询并审阅当前完整范围')
  requireCondition(input.changeId === active.assessment.changeId && input.taskId === active.assessment.taskId,
    'EXECUTION_CONTEXT_MISMATCH', '范围更新必须属于原 change 和 task；新任务不能覆盖原执行')
  requireCondition(active.discovery.files.every(file => discovery.files.includes(file))
    && active.assessment.designFiles.every(file => input.designFiles.some(next => next.path === file.path && next.level === file.level)),
  'EXECUTION_SCOPE_SHRINK', '范围更新必须保留原源码和设计文件；重新提交完整范围，不能借增补释放旧范围')
  const levels = { none: 0, detail: 1, architecture: 2 }
  requireCondition(active.policy.verification.every(kind => policy.verification.includes(kind))
    && levels[policy.design] >= levels[active.policy.design]
    && (active.policy.spec !== 'DELTA_REQUIRED' || policy.spec === 'DELTA_REQUIRED'),
  'EXECUTION_POLICY_DOWNGRADE', '增补范围不能降低原验证或设计要求；保留原影响类别')
  const { scopeHistory = [], ...previous } = active
  return { ...active, discovery, assessment: input, policy, verification: undefined,
    designBaseline: { ...Object.fromEntries(input.designFiles.map(file => [file.path, fileDigest(active.project, file.path)])),
      ...active.designBaseline },
    scopeHistory: [...scopeHistory, { updatedAt: new Date().toISOString(), actor: input.actor, reason: input.reason, previous }] }
}
