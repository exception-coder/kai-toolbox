import fs from 'node:fs'
import { executionEventSchema } from './contracts.js'
import { checkExecution, loadExecution } from './service.js'
import { projectContext } from './repository.js'
import { POLICY_VERSION } from './policy.js'
import { readWriter } from './session.js'
import { checkReadiness } from '../specResolution/service.js'
import { hash, readJson, safePath, statePath } from '../specResolution/storage.js'
import { ResolutionError, requireCondition } from '../specResolution/contracts.js'

/** The only adapter-facing router: storage layout and policy stay inside Forge. */
export function checkExecutionEvent(raw: unknown) {
  let enforcement: 'warn' | 'block' = 'block'
  let governanceBackend: 'forge' | 'legacy' | 'none' = 'forge'
  try {
    const input = executionEventSchema.parse(raw)
    const { root } = projectContext(input.project, false)
    const record = input.sessionId ? loadExecution(root, input.sessionId) : undefined
    const writer = readWriter(root)
    if (record || writer) {
      requireCondition(record, 'WORKSPACE_BUSY', '共享工作区已有执行；使用原会话恢复或等待写入者结束，不自行创建 worktree')
      const result = checkExecution({ project: root, sessionId: input.sessionId, files: input.files, command: input.command,
        operation: ['COMMIT', 'STOP'].includes(input.event) ? 'BEFORE_COMMIT' : 'BEFORE_IMPLEMENTATION' })
      return { ...result, protocolVersion: 2, policyVersion: POLICY_VERSION, governanceBackend, enforcement,
        legacyGovernanceRequired: result.policy.spec !== 'NO_SPEC_CHANGE' }
    }
    governanceBackend = 'legacy'
    enforcement = input.legacyMode
    // Unbound Git and Stop preserve the existing host/legacy workflow.
    if (['GIT', 'STOP'].includes(input.event) || !fs.existsSync(safePath(root, 'openspec/config.yaml'))) {
      return { protocolVersion: 2, policyVersion: POLICY_VERSION, allowed: true, code: 'PASS',
        governanceBackend: 'none', enforcement, legacyGovernanceRequired: true }
    }
    let changeId = input.changeId
    let branch: string | undefined
    if (!changeId && input.sessionId) {
      const file = statePath(root, `session-${hash(input.sessionId)}`)
      if (fs.existsSync(file)) {
        const binding = readJson<{ project: string; changeId: string; branch: string }>(file)
        requireCondition(fs.realpathSync(binding.project) === root, 'CHANGE_CONTEXT_MISMATCH', '会话绑定不属于当前项目；重新 resolve_specs')
        changeId = binding.changeId; branch = binding.branch
      }
    }
    requireCondition(changeId, 'CHANGE_CONTEXT_MISMATCH', '先 discover_execution / assess_execution，或 resolve_specs 绑定已有 change')
    const result = checkReadiness({ project: root, changeId, branch, files: input.files,
      operation: input.event === 'COMMIT' ? 'BEFORE_COMMIT' : 'BEFORE_IMPLEMENTATION' })
    return { ...result, protocolVersion: 2, policyVersion: POLICY_VERSION, governanceBackend, enforcement, legacyGovernanceRequired: true }
  } catch (error) {
    return { protocolVersion: 2, policyVersion: POLICY_VERSION, allowed: false,
      code: error instanceof ResolutionError ? error.code : 'CHECK_ERROR',
      message: error instanceof Error ? error.message : String(error), enforcement, governanceBackend,
      legacyGovernanceRequired: true, actions: ['读取 session_init 的执行归属；修复具体范围、分支或证据问题后重试。'] }
  }
}
