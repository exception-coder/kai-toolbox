import fs from 'node:fs'
import { executionContextSchema } from './contracts.js'
import { loadExecution } from './service.js'
import { inputFingerprint, projectContext } from './repository.js'
import { BRANCH_POLICY, POLICY_VERSION } from './policy.js'
import { safePath } from '../specResolution/storage.js'
import { readWriters } from './writers.js'

export function readWriter(root: string) {
  return readWriters(root)[0]
}

/** Runtime projection only: no task creation, workspace lock, initialization or takeover. */
export function initSession(raw: unknown) {
  const input = executionContextSchema.parse(raw)
  const { root, branch } = projectContext(input.project, false)
  const execution = loadExecution(root, input.sessionId)
  const writers = readWriters(root)
  const writer = writers.find(item => item.sessionId === input.sessionId) || writers[0]
  const ownsWriter = Boolean(execution && writer?.executionId === execution.executionId && writer.sessionId === input.sessionId)
  const configured = (file: string) => fs.existsSync(safePath(root, file))
  return { protocolVersion: 2, policyVersion: POLICY_VERSION, project: root, sessionId: input.sessionId, branch: branch || null,
    capabilities: {
      execution: { configured: true, available: true, authorization: ownsWriter ? 'BOUND_SCOPE' : 'NOT_GRANTED', enforcement: 'HOST_DEPENDENT' },
      openspec: { configured: configured('openspec/config.yaml'), available: null, authorization: 'NOT_GRANTED', enforcement: 'HOST_DEPENDENT', reason: 'CLI_NOT_PROBED' },
      codeGraph: { configured: configured('graphify-out/graph.json'), available: null, freshness: 'NOT_CHECKED' },
    },
    execution: execution ? { executionId: execution.executionId, taskId: execution.assessment.taskId || null,
      changeId: execution.assessment.changeId || null, request: execution.discovery.request,
      branch: execution.branch, files: execution.discovery.files, ownsWriter,
      state: ownsWriter && branch === execution.branch ? 'BOUND' : 'CONTEXT_DRIFT',
      verification: !execution.verification ? 'NOT_RUN'
        : execution.verification.fingerprint === inputFingerprint(root, execution.verification.inputFiles) ? 'CURRENT' : 'STALE',
      policy: execution.policy } : null,
    workspace: { writer: writer ? { executionId: writer.executionId, ownedBySession: writer.sessionId === input.sessionId } : null,
      writers: writers.map(item => ({ executionId: item.executionId, ownedBySession: item.sessionId === input.sessionId, scopes: item.scopes })) },
    branchPolicy: BRANCH_POLICY,
    actions: ['execution 仅代表 Sidecar 代码写入绑定；null 不能推断 Forge Runtime 自动监督不存在。写入前 resolve_execution_context → 定向阅读 → discover_execution → assess_execution。',
      '已有执行使用原宿主会话恢复；当前任务标识仅引用已有 Task，不替代 OpenSpec/宿主任务状态。',
      'available 不代表当前操作已授权，也不证明宿主已触发 Hook。'] }
}
