import fs from 'node:fs'
import { requireCondition } from '../specResolution/contracts.js'
import { hash, locked, readJson, readText, safePath, saveJson, statePath } from '../specResolution/storage.js'
import { indexSpecs } from '../specResolution/indexer.js'
import { checkReadiness } from '../specResolution/service.js'
import { assessExecutionSchema, executionCheckSchema, executionContextSchema, type Assessment } from './contracts.js'
import { executionPolicy, isBranchMutation } from './policy.js'
import { git, fileDigest, inputFingerprint, projectContext } from './repository.js'
import type { Discovery } from './context.js'

export type Execution = {
  schemaVersion: 1; executionId: string; project: string; branch: string; sessionId: string; baselineHead: string;
  assessment: Assessment; discovery: Discovery; policy: ReturnType<typeof executionPolicy>;
  designBaseline: Record<string, string>; verification?: { fingerprint: string; inputFiles: string[]; results: Array<{ kind: string; status: string; purpose: string; command: string[]; durationMs: number; diagnostic: string }> };
  release?: { status: 'AUTO_RECLAIMED'; releasedAt: string; reclaimedBySessionId: string; commit: string };
}
type Writer = { sessionId: string; executionId: string }
export function loadExecution(project: string, sessionId: string): Execution | undefined {
  const root = fs.realpathSync(project)
  const binding = statePath(root, `execution-session-${hash(sessionId)}`)
  if (!fs.existsSync(binding)) return undefined
  const pointer = readJson<{ executionId: string }>(binding)
  requireCondition(/^ex_[a-f0-9]{32}$/.test(pointer.executionId), 'EXECUTION_INVALID', '执行绑定无效')
  const result = readJson<Execution>(statePath(root, pointer.executionId))
  requireCondition(result.schemaVersion === 1 && result.project === root && result.sessionId === sessionId,
    'EXECUTION_INVALID', '执行记录不属于当前项目和会话')
  return result
}
export function assessExecution(raw: unknown) {
  const input = assessExecutionSchema.parse(raw); const { root, branch } = projectContext(input.project)
  const discovery = readJson<Discovery>(statePath(root, input.discoveryId))
  requireCondition(discovery.project === root && discovery.sessionId === input.sessionId && discovery.branch === branch,
    'EXECUTION_CONTEXT_MISMATCH', '探索记录不属于当前项目、会话或分支')
  requireCondition(discovery.specRevision === indexSpecs(root).revision && discovery.sourceRevision === inputFingerprint(root, discovery.files),
    'DISCOVERY_STALE', '探索后相关内容变化；重新 discover_execution')
  for (const evidence of input.evidence) requireCondition(readText(safePath(root, evidence.path)).includes(evidence.quote),
    'EVIDENCE_INVALID', `引用不在原文中：${evidence.path}`)
  const policy = executionPolicy(input)
  requireCondition(policy.spec !== 'NEEDS_EVIDENCE', 'IMPACT_UNRESOLVED', '行为影响尚未确定，先补充证据，不自动要求写规格')
  if (policy.spec === 'DELTA_REQUIRED') requireCondition(input.changeId && fs.existsSync(safePath(root, `openspec/changes/${input.changeId}/tasks.md`)),
    'CHANGE_REQUIRED', '行为发生变化；先复用匹配 change，确无匹配再使用 OpenSpec 创建')
  if (input.design !== 'none') requireCondition(input.designFiles.some(file => file.level === 'detail'), 'DESIGN_REQUIRED', '实现机制变化需要绑定受影响详设')
  if (input.design === 'architecture') requireCondition(input.designFiles.some(file => file.level === 'overview'), 'DESIGN_REQUIRED', '架构边界变化需要绑定受影响概设')
  const executionId = `ex_${hash(JSON.stringify({ input, branch, discovery: discovery.discoveryId })).slice(0, 32)}`
  return locked(root, () => {
    const writerFile = statePath(root, 'execution-writer')
    let writer = fs.existsSync(writerFile) ? readJson<Writer>(writerFile) : undefined
    if (writer && writer.sessionId !== input.sessionId && reclaimCompletedWriter(root, writer, input.sessionId, branch)) {
      writer = undefined
    }
    requireCondition(!writer || writer.sessionId === input.sessionId, 'WORKSPACE_BUSY',
      '共享工作区已有写入会话且尚未证明完成；原会话需完成提交和验证并保持范围干净，无法证明完成时禁止接管')
    const existing = statePath(root, executionId)
    const record: Execution = fs.existsSync(existing) ? readJson<Execution>(existing) : {
      schemaVersion: 1, executionId, project: root, branch, sessionId: input.sessionId, baselineHead: git(root, ['rev-parse', 'HEAD']),
      assessment: input, discovery, policy, designBaseline: Object.fromEntries(input.designFiles.map(file => [file.path, fileDigest(root, file.path)])),
    }
    saveJson(existing, record)
    saveJson(writerFile, { sessionId: input.sessionId, executionId })
    saveJson(statePath(root, `execution-session-${hash(input.sessionId)}`), { executionId })
    return { executionId, policy, branch, files: discovery.files, evidenceSource: 'AGENT_REVIEWED',
      rules: ['保持当前分支，不为子任务自行建 branch/worktree；依赖顺序执行，每任务原子提交。',
        '提交前 run_execution_verification；影响范围扩大时重新探索、判定。', '分类依据来自具名 Agent 审阅，不代表人工批准或语义正确性证明。'] }
  })
}

function reclaimCompletedWriter(root: string, writer: Writer, nextSessionId: string, branch: string) {
  try {
    const recordFile = statePath(root, writer.executionId)
    if (!fs.existsSync(recordFile)) return false
    const record = readJson<Execution>(recordFile)
    if (record.schemaVersion !== 1 || record.project !== root || record.executionId !== writer.executionId
      || record.sessionId !== writer.sessionId || record.branch !== branch) return false
    const commit = git(root, ['rev-parse', 'HEAD'])
    if (commit === record.baselineHead) return false
    git(root, ['merge-base', '--is-ancestor', record.baselineHead, 'HEAD'])
    checkExecution({ project: root, sessionId: record.sessionId, operation: 'BEFORE_COMMIT' })
    const scopedPaths = [...record.discovery.files, ...record.assessment.designFiles.map(file => file.path),
      ...(record.assessment.changeId ? [`openspec/changes/${record.assessment.changeId}`] : [])]
    if (git(root, ['status', '--porcelain', '--', ...scopedPaths])) return false
    const bindingFile = statePath(root, `execution-session-${hash(writer.sessionId)}`)
    if (fs.existsSync(bindingFile)) {
      const binding = readJson<{ executionId: string }>(bindingFile)
      if (binding.executionId !== writer.executionId) return false
    }
    record.release = { status: 'AUTO_RECLAIMED', releasedAt: new Date().toISOString(), reclaimedBySessionId: nextSessionId, commit }
    saveJson(recordFile, record)
    if (fs.existsSync(bindingFile)) fs.unlinkSync(bindingFile)
    fs.unlinkSync(statePath(root, 'execution-writer'))
    return true
  } catch {
    return false
  }
}

export function checkExecution(raw: unknown) {
  const input = executionCheckSchema.parse(raw); const { root, branch } = projectContext(input.project)
  const record = loadExecution(root, input.sessionId)
  requireCondition(record, 'EXECUTION_MISSING', '先 discover_execution → assess_execution；无需预先创建 OpenSpec change')
  requireCondition(record.branch === branch, 'BRANCH_DRIFT', '当前分支偏离分配分支，重新核对执行上下文')
  const writer = readJson<{ executionId: string }>(statePath(root, 'execution-writer'))
  requireCondition(writer.executionId === record.executionId, 'WORKSPACE_BUSY', '执行不再持有共享工作区写入权')
  requireCondition(!isBranchMutation(input.command), 'BRANCH_POLICY_DENIED', '共享分支禁止 Agent 自行切换/创建分支或 worktree；额外分支须由宿主明确授权并重新绑定')
  requireCondition(record.discovery.specRevision === indexSpecs(root).revision, 'SPEC_INDEX_STALE', '正式规格变化，重新探索和判定')
  const staged = input.operation === 'BEFORE_COMMIT' ? git(root, ['diff', '--cached', '--name-only', '--no-renames', '-z']).split('\0').filter(Boolean) : []
  for (const file of [...input.files, ...staged]) {
    safePath(root, file)
    requireCondition(record.discovery.files.includes(file) || record.assessment.designFiles.some(item => item.path === file)
      || Boolean(record.assessment.changeId && file.startsWith(`openspec/changes/${record.assessment.changeId}/`)),
    'IMPLEMENTATION_SCOPE_DRIFT', `文件超出执行范围：${file}；重新探索实际影响`)
  }
  if (record.policy.spec === 'DELTA_REQUIRED') checkReadiness({ project: root, branch, changeId: record.assessment.changeId, files: input.files, operation: input.operation })
  if (input.operation === 'BEFORE_COMMIT') checkDelivery(record)
  return { allowed: true, code: 'PASS', executionId: record.executionId, policy: record.policy,
    warnings: ['影响分类需要业务审阅；Hook 不构成任意 Shell 或 Git 管理目录的安全沙箱。'] }
}
export function checkDelivery(record: Execution) {
  for (const file of record.assessment.designFiles) requireCondition(fileDigest(record.project, file.path) !== 'MISSING'
    && fileDigest(record.project, file.path) !== record.designBaseline[file.path], 'DESIGN_UPDATE_REQUIRED', `更新受影响设计：${file.path}`)
  const verification = record.verification
  requireCondition(verification && verification.fingerprint === inputFingerprint(record.project, verification.inputFiles), 'VERIFICATION_STALE', '执行对应验证；相关输入变更后重新验证')
  for (const kind of record.policy.verification) requireCondition(verification.results.some(result => result.kind === kind && result.status === 'PASSED'),
    'VERIFICATION_NOT_RUN', `缺少通过的 ${kind} 验证，不能用 API 200 代替`)
  requireCondition(verification.results.every(result => result.status === 'PASSED'), 'VERIFICATION_FAILED', '存在失败验证')
  // A staged blob can differ from the successfully tested working copy.
  requireCondition(!git(record.project, ['diff', '--name-only', '--', ...verification.inputFiles]),
    'STAGED_INPUT_MISMATCH', '验证输入仍有未暂存修改；待提交内容与测试工作区不一致')
}
export function finishExecution(raw: unknown) {
  const input = executionContextSchema.parse(raw)
  checkExecution({ ...input, operation: 'BEFORE_COMMIT' })
  const record = loadExecution(input.project, input.sessionId)!
  requireCondition(git(record.project, ['rev-parse', 'HEAD']) !== record.baselineHead, 'COMMIT_REQUIRED', '执行结束前提交已验证任务；不代替任务原子性审阅')
  git(record.project, ['merge-base', '--is-ancestor', record.baselineHead, 'HEAD'])
  requireCondition(!git(record.project, ['status', '--porcelain', '--', ...record.discovery.files, ...record.assessment.designFiles.map(file => file.path)]),
    'TASK_DIRTY', '执行范围仍有未提交内容')
  return locked(record.project, () => {
    fs.unlinkSync(statePath(record.project, 'execution-writer'))
    fs.unlinkSync(statePath(record.project, `execution-session-${hash(input.sessionId)}`))
    return { allowed: true, code: 'PASS', executionId: record.executionId, commit: git(record.project, ['rev-parse', 'HEAD']) }
  })
}
