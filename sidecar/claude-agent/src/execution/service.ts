import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { requireCondition } from '../specResolution/contracts.js'
import { hash, locked, readJson, readText, safePath, saveJson, statePath } from '../specResolution/storage.js'
import { indexSpecs } from '../specResolution/indexer.js'
import { checkReadiness } from '../specResolution/service.js'
import { abortExecutionSchema, assessExecutionSchema, executionCheckSchema, executionContextSchema, type Assessment } from './contracts.js'
import { executionPolicy, isBranchMutation } from './policy.js'
import { git, fileDigest, inputFingerprint, projectContext } from './repository.js'
import type { Discovery } from './context.js'
import { executionScopes, readWriters, releaseWriter, scopesConflict, writeWriters, type Writer } from './writers.js'
import { updateExecutionScope } from './scopeUpdate.js'
import { specsCurrent } from './specDependencies.js'
import { developerControl } from './developerControl.js'

export type Execution = {
  schemaVersion: 1; executionId: string; project: string; branch: string; sessionId: string; baselineHead: string;
  assessment: Assessment; discovery: Discovery; policy: ReturnType<typeof executionPolicy>;
  designBaseline: Record<string, string>; verification?: { fingerprint: string; inputFiles: string[];
    pendingChecks?: Array<{ kind: string; program: string; args: string[]; cwd: string; purpose: string; replaces?: string }>;
    results: Array<{ checkId?: string; kind: string; status: string; purpose: string; command: string[]; durationMs: number; diagnostic: string }> };
  deliveryCommit?: { requestFingerprint: string; commit: string };
  scopeHistory?: Array<{ updatedAt: string; actor: string; reason: string; previous: Omit<Execution, 'scopeHistory'> }>;
  release?: { status: 'AUTO_RECLAIMED'; releasedAt: string; reclaimedBySessionId: string; commit: string }
    | { status: 'COMPLETED'; releasedAt: string; commit: string }
    | { status: 'ABORTED'; releasedAt: string; actor: string; reason: string; head: string; scopeStatus: string[] };
}
function releasePointers(root: string, record: Execution) {
  releaseWriter(root, record)
  const binding = statePath(root, `execution-session-${hash(record.sessionId)}`)
  if (fs.existsSync(binding) && readJson<{ executionId: string }>(binding).executionId === record.executionId) fs.unlinkSync(binding)
}
function scopedPaths(record: Execution) {
  return [...record.discovery.files, ...record.assessment.designFiles.map(file => file.path),
    ...(record.assessment.changeId ? [`openspec/changes/${record.assessment.changeId}`] : [])]
}
function scopedCommit(record: Execution) {
  return git(record.project, ['log', '--format=%H', `${record.baselineHead}..HEAD`, '--', ...scopedPaths(record)])
}
export function inspectExecutionWriter(raw: unknown) {
  const input = executionContextSchema.pick({ project: true }).parse(raw)
  const { root, branch } = projectContext(input.project, false)
  const writers = readWriters(root)
  if (!writers.length) return { project: root, branch, writer: null, writers: [] }
  const snapshots = writers.map(writer => inspectWriter(root, writer))
  return { project: root, branch, head: git(root, ['rev-parse', 'HEAD']),
    writer: snapshots.length === 1 ? snapshots[0] : null, writers: snapshots }
}
function inspectWriter(root: string, writer: Writer) {
  const record = readJson<Execution>(statePath(root, writer.executionId))
  requireCondition(record.schemaVersion === 1 && record.project === root && record.executionId === writer.executionId
    && record.sessionId === writer.sessionId,
  'EXECUTION_INVALID', '执行记录与写入指针不匹配')
  const bindingFile = statePath(root, `execution-session-${hash(writer.sessionId)}`)
  const binding = fs.existsSync(bindingFile) ? readJson<{ executionId: string }>(bindingFile) : undefined
  requireCondition(!binding || binding.executionId === writer.executionId,
    'EXECUTION_INVALID', '会话绑定与写入指针不匹配')
  const scopedPaths = [...new Set([...record.discovery.files, ...record.assessment.designFiles.map(file => file.path),
    ...(record.assessment.changeId ? [`openspec/changes/${record.assessment.changeId}`] : [])])]
  const scopeStatus = git(root, ['status', '--porcelain', '--untracked-files=all', '--', ...scopedPaths]).split(/\r?\n/).filter(Boolean)
  const scopeFiles = git(root, ['--literal-pathspecs', 'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...scopedPaths]).split('\0').filter(Boolean)
  const scopeFingerprint = hash(JSON.stringify([inputFingerprint(root, scopeFiles),
    git(root, ['--literal-pathspecs', 'ls-files', '--stage', '-z', '--', ...scopedPaths])]))
  return {
    executionId: record.executionId, ownerSessionId: record.sessionId, assignedBranch: record.branch,
    baselineHead: record.baselineHead, discoveryId: record.discovery.discoveryId, scopeRevision: record.scopeHistory?.length ?? 0,
    scopes: writer.scopes, scopeStatus, scopedPaths, scopeFingerprint,
    verification: record.verification ? 'RECORDED' : 'NOT_RUN' }
}

export function abortExecution(raw: unknown) {
  const input = abortExecutionSchema.parse(raw)
  const { root } = projectContext(input.project, false)
  return locked(root, () => {
    const inspected = inspectExecutionWriter({ project: root })
    const writer = inspected.writers.find(item => item.executionId === input.executionId)
    requireCondition(writer && writer.executionId === input.executionId && writer.ownerSessionId === input.ownerSessionId
      && writer.assignedBranch === input.branch && inspected.branch === (input.expectedCurrentBranch ?? input.branch) && inspected.head === input.expectedHead
      && writer.scopeFingerprint === input.expectedScopeFingerprint,
    'EXECUTION_CONTEXT_MISMATCH', '写入身份、分支或 HEAD 已变化；重新查询后再中止')
    const recordFile = statePath(root, writer.executionId)
    const record = readJson<Execution>(recordFile)
    if (record.release) {
      requireCondition(record.release.status === 'ABORTED' && record.release.actor === input.actor
        && record.release.reason === input.reason && record.release.head === input.expectedHead,
      'EXECUTION_CONTEXT_MISMATCH', '已有中止审计与本次请求不符；保留现场')
    } else {
      record.release = { status: 'ABORTED', releasedAt: new Date().toISOString(), actor: input.actor,
        reason: input.reason, head: inspected.head!, scopeStatus: writer.scopeStatus }
      saveJson(recordFile, record)
    }
    releasePointers(root, record)
    return { allowed: true, code: 'PASS', executionId: record.executionId, release: record.release }
  })
}
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
  requireCondition(specsCurrent(root, discovery, indexSpecs(root).revision) && discovery.sourceRevision === inputFingerprint(root, discovery.files),
    'DISCOVERY_STALE', '探索后相关内容变化；重新 discover_execution')
  for (const evidence of input.evidence) requireCondition(readText(safePath(root, evidence.path)).includes(evidence.quote),
    'EVIDENCE_INVALID', `引用不在原文中：${evidence.path}`)
  if (discovery.specDependencies) for (const evidence of input.evidence) {
    requireCondition(!evidence.path.startsWith('openspec/specs/') || evidence.path in discovery.specDependencies,
      'SPEC_DEPENDENCY_MISSING', '正式规格证据未包含在依赖清单；重新探索完整依赖')
  }
  const policy = executionPolicy(input)
  requireCondition(policy.spec !== 'NEEDS_EVIDENCE', 'IMPACT_UNRESOLVED', '行为影响尚未确定，先补充证据，不自动要求写规格')
  if (policy.spec === 'DELTA_REQUIRED') requireCondition(input.changeId && fs.existsSync(safePath(root, `openspec/changes/${input.changeId}/tasks.md`)),
    'CHANGE_REQUIRED', '行为发生变化；先复用匹配 change，确无匹配再使用 OpenSpec 创建')
  if (input.design !== 'none') requireCondition(input.designFiles.some(file => file.level === 'detail'), 'DESIGN_REQUIRED', '实现机制变化需要绑定受影响详设')
  if (input.design === 'architecture') requireCondition(input.designFiles.some(file => file.level === 'overview'), 'DESIGN_REQUIRED', '架构边界变化需要绑定受影响概设')
  let executionId = `ex_${hash(JSON.stringify({ input, branch, discovery: discovery.discoveryId })).slice(0, 32)}`
  return locked(root, () => {
    requireCondition(specsCurrent(root, discovery, indexSpecs(root).revision) && discovery.sourceRevision === inputFingerprint(root, discovery.files),
      'DISCOVERY_STALE', '等待写入事务期间输入变化；重新 discover_execution')
    let writers = readWriters(root)
    for (const writer of writers) {
      const previous = readJson<Execution>(statePath(root, writer.executionId))
      if (previous.release && previous.project === root && previous.executionId === writer.executionId && previous.sessionId === writer.sessionId) {
        releasePointers(root, previous)
      }
    }
    writers = readWriters(root)
    const scopes = executionScopes(root, [...discovery.files, ...input.designFiles.map(file => file.path),
      ...(input.changeId ? [`openspec/changes/${input.changeId}/tasks.md`] : [])])
    for (const writer of writers) {
      if (writer.sessionId !== input.sessionId && scopesConflict(writer.scopes, scopes)) {
        reclaimCompletedWriter(root, writer, input.sessionId, branch)
      }
    }
    writers = readWriters(root)
    const conflictingWriter = writers.find(writer => writer.sessionId !== input.sessionId && scopesConflict(writer.scopes, scopes))
    requireCondition(!conflictingWriter, 'WORKSPACE_BUSY',
      `目标范围已有写入会话 ${conflictingWriter?.sessionId} 的执行 ${conflictingWriter?.executionId} 占用（范围：${conflictingWriter?.scopes.join(', ')}）；先 inspect_execution_writer，原会话丢失时显式 abort_execution 后建立新执行`)
    const writer = writers.find(item => item.sessionId === input.sessionId)
    requireCondition(!input.update || writer?.executionId === input.update.executionId,
      'EXECUTION_CONTEXT_MISMATCH', '更新目标不属于本会话的活跃执行；重新查询原身份，禁止接管或创建替代执行')
    let updated: Execution | undefined
    if (writer) {
      const active = readJson<Execution>(statePath(root, writer.executionId))
      requireCondition(!active.release && active.branch === branch, 'EXECUTION_CONTEXT_MISMATCH', '原执行已结束或分支变化')
      if (active.discovery.discoveryId !== discovery.discoveryId || JSON.stringify(active.assessment) !== JSON.stringify(input)) {
        updated = updateExecutionScope(active, discovery, input, policy)
      }
      executionId = active.executionId
    }
    // Released records are immutable history, never a new lease or verification baseline.
    if (fs.existsSync(statePath(root, executionId)) && readJson<Execution>(statePath(root, executionId)).release) {
      executionId = `ex_${randomUUID().replaceAll('-', '')}`
    }
    const existing = statePath(root, executionId)
    const record: Execution = updated ?? (fs.existsSync(existing) ? readJson<Execution>(existing) : {
      schemaVersion: 1, executionId, project: root, branch, sessionId: input.sessionId, baselineHead: git(root, ['rev-parse', 'HEAD']),
      assessment: input, discovery, policy, designBaseline: Object.fromEntries(input.designFiles.map(file => [file.path, fileDigest(root, file.path)])),
    })
    saveJson(existing, record)
    writeWriters(root, [...writers.filter(item => item.sessionId !== input.sessionId), { sessionId: input.sessionId, executionId, scopes }])
    saveJson(statePath(root, `execution-session-${hash(input.sessionId)}`), { executionId })
    return { executionId, policy, branch, files: discovery.files, evidenceSource: 'AGENT_REVIEWED',
      rules: ['保持当前分支；同模块或共享文件串行，不同模块可并行编辑；提交前只暂存本执行文件。',
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
    checkExecution({ project: root, sessionId: record.sessionId, operation: 'BEFORE_FINISH' })
    if (!scopedCommit(record) || git(root, ['status', '--porcelain', '--', ...scopedPaths(record)])) return false
    const bindingFile = statePath(root, `execution-session-${hash(writer.sessionId)}`)
    if (fs.existsSync(bindingFile)) {
      const binding = readJson<{ executionId: string }>(bindingFile)
      if (binding.executionId !== writer.executionId) return false
    }
    record.release = { status: 'AUTO_RECLAIMED', releasedAt: new Date().toISOString(), reclaimedBySessionId: nextSessionId, commit }
    saveJson(recordFile, record)
    if (fs.existsSync(bindingFile)) fs.unlinkSync(bindingFile)
    releaseWriter(root, record)
    return true
  } catch {
    return false
  }
}

export function checkExecution(raw: unknown) {
  const input = executionCheckSchema.parse(raw); const { root, branch } = projectContext(input.project)
  const record = loadExecution(root, input.sessionId)
  requireCondition(record, 'EXECUTION_MISSING', '先 discover_execution → assess_execution；无需预先创建 OpenSpec change')
  requireCondition(!record.release, 'EXECUTION_RELEASED', '执行已结束或中止；重新 discover_execution → assess_execution 建立新执行，不重试旧执行')
  requireCondition(record.branch === branch, 'BRANCH_DRIFT', '当前分支偏离分配分支，重新核对执行上下文')
  const writer = readWriters(root).find(item => item.executionId === record.executionId)
  requireCondition(writer?.sessionId === input.sessionId, 'WORKSPACE_BUSY', '执行不再持有模块写入权')
  requireCondition(!isBranchMutation(input.command), 'BRANCH_POLICY_DENIED', '共享分支禁止 Agent 自行切换/创建分支或 worktree；额外分支须由宿主明确授权并重新绑定')
  requireCondition(specsCurrent(root, record.discovery, indexSpecs(root).revision), 'SPEC_INDEX_STALE',
    `${record.discovery.specDependencies ? '依赖规格变化' : '正式规格变化'}，重新探索和判定；旧记录未登记依赖时仍按全局检查`)
  const staged = input.operation === 'BEFORE_COMMIT' ? git(root, ['diff', '--cached', '--name-only', '--no-renames', '-z']).split('\0').filter(Boolean) : []
  for (const file of [...input.files, ...staged]) {
    safePath(root, file)
    requireCondition(record.discovery.files.includes(file) || record.assessment.designFiles.some(item => item.path === file)
      || Boolean(record.assessment.changeId && file.startsWith(`openspec/changes/${record.assessment.changeId}/`)),
    'IMPLEMENTATION_SCOPE_DRIFT', `文件超出执行范围：${file}；重新探索实际影响`)
  }
  if (record.policy.spec === 'DELTA_REQUIRED') checkReadiness({ project: root, branch, changeId: record.assessment.changeId, files: input.files,
    operation: input.operation === 'BEFORE_COMMIT' ? 'BEFORE_COMMIT' : 'BEFORE_IMPLEMENTATION' })
  const deferredCommit = input.operation === 'BEFORE_COMMIT'
    && developerControl(root).verificationCadence === 'CODING_FIRST'
  if (input.operation !== 'BEFORE_IMPLEMENTATION' && !deferredCommit) checkDelivery(record)
  if (deferredCommit) return { allowed: true, code: 'IMPLEMENTATION_COMMIT_ALLOWED', verified: false,
    executionId: record.executionId, policy: record.policy,
    warnings: ['编码优先：允许保留实现提交；尚未验收，原执行和验证记录保留，不代表交付通过。'] }
  return { allowed: true, code: 'PASS', executionId: record.executionId, policy: record.policy,
    warnings: ['影响分类需要业务审阅；Hook 不构成任意 Shell 或 Git 管理目录的安全沙箱。'] }
}
export function checkDelivery(record: Execution, requireStagedEquality = true) {
  for (const file of record.assessment.designFiles) requireCondition(fileDigest(record.project, file.path) !== 'MISSING'
    && fileDigest(record.project, file.path) !== record.designBaseline[file.path], 'DESIGN_UPDATE_REQUIRED', `更新受影响设计：${file.path}`)
  const verification = record.verification
  requireCondition(verification && verification.fingerprint === inputFingerprint(record.project, verification.inputFiles), 'VERIFICATION_STALE', '执行对应验证；相关输入变更后重新验证')
  requireCondition(!verification.pendingChecks?.length, 'VERIFICATION_NOT_RUN', '仍有因调用预算延期的检查；运行 pendingChecks 后再提交')
  for (const kind of record.policy.verification) requireCondition(verification.results.some(result => result.kind === kind && result.status === 'PASSED'),
    'VERIFICATION_NOT_RUN', `缺少通过的 ${kind} 验证，不能用 API 200 代替`)
  requireCondition(verification.results.every(result => result.status === 'PASSED'), 'VERIFICATION_FAILED', '存在失败验证')
  // A staged blob can differ from the successfully tested working copy.
  const unstagedInputs = git(record.project, ['diff', '--name-only', '-z', '--', ...verification.inputFiles]).split('\0').filter(Boolean)
  requireCondition(!requireStagedEquality || !unstagedInputs.length, 'STAGED_INPUT_MISMATCH',
    `验证输入仍有未暂存修改；待提交内容与测试工作区不一致。差异文件：${JSON.stringify(unstagedInputs)}。`
    + '先逐项核对 diff 和当前任务归属，将属于本任务的已验证改动按具体路径暂存，再以原执行重试 BEFORE_COMMIT；'
    + '共享文件须区分内容变化与格式变化，不能仅因文件共享就认定混合归属。存在其他任务的实质改动时保留现场并协调隔离，禁止整批暂存；'
    + '若修改了验证输入则重新验证，不要通过删除证据或重建 writer 绕过检查。')
}
export function finishExecution(raw: unknown) {
  const input = executionContextSchema.parse(raw)
  const { root } = projectContext(input.project)
  return locked(root, () => {
    const previous = loadExecution(root, input.sessionId)
    if (previous?.release?.status === 'COMPLETED') {
      releasePointers(root, previous)
      return { allowed: true, code: 'PASS', executionId: previous.executionId, commit: previous.release.commit }
    }
    checkExecution({ ...input, operation: 'BEFORE_IMPLEMENTATION' })
    const record = loadExecution(input.project, input.sessionId)!
    checkDelivery(record)
    requireCondition(git(record.project, ['rev-parse', 'HEAD']) !== record.baselineHead, 'COMMIT_REQUIRED', '执行结束前提交已验证任务；不代替任务原子性审阅')
    git(record.project, ['merge-base', '--is-ancestor', record.baselineHead, 'HEAD'])
    requireCondition(Boolean(scopedCommit(record)), 'COMMIT_REQUIRED', '其它模块提交不等于当前执行已提交')
    requireCondition(!git(record.project, ['status', '--porcelain', '--', ...record.discovery.files, ...record.assessment.designFiles.map(file => file.path)]),
      'TASK_DIRTY', '执行范围仍有未提交内容')
    const changeScope = record.assessment.changeId ? [`openspec/changes/${record.assessment.changeId}`] : []
    requireCondition(!changeScope.length || !git(root, ['status', '--porcelain', '--', ...changeScope]), 'TASK_DIRTY', 'Change 范围仍有未提交内容')
    record.release = { status: 'COMPLETED', releasedAt: new Date().toISOString(), commit: git(root, ['rev-parse', 'HEAD']) }
    saveJson(statePath(root, record.executionId), record)
    releasePointers(root, record)
    return { allowed: true, code: 'PASS', executionId: record.executionId, commit: git(record.project, ['rev-parse', 'HEAD']) }
  })
}
