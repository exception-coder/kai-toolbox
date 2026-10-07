import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'
import { z } from 'zod'
import { executionContextSchema } from './contracts.js'
import { checkDelivery, checkExecution, inspectExecutionWriter, loadExecution } from './service.js'
import { git, inputFingerprint } from './repository.js'
import { hash, locked, safePath, saveJson, statePath } from '../specResolution/storage.js'
import { requireCondition } from '../specResolution/contracts.js'

export const commitExecutionSchema = executionContextSchema.extend({
  executionId: z.string().regex(/^ex_[a-f0-9]{32}$/),
  expectedHead: z.string().regex(/^[a-f0-9]{40,64}$/),
  expectedScopeFingerprint: z.string().length(64),
  message: z.string().trim().min(10).max(12000),
})

/** Git --only owns the temporary commit index and preserves other staged paths; hooks remain enabled. */
export async function commitExecution(raw: unknown, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const input = commitExecutionSchema.parse(raw)
  const record = loadExecution(input.project, input.sessionId)
  requireCondition(record && record.executionId === input.executionId && !record.release, 'EXECUTION_CONTEXT_MISMATCH', '先查询本会话当前执行')
  const requestFingerprint = hash(JSON.stringify(input))
  if (record.deliveryCommit?.requestFingerprint === requestFingerprint) {
    git(record.project, ['merge-base', '--is-ancestor', record.deliveryCommit.commit, 'HEAD'])
    return { allowed: true, code: 'PASS', commit: record.deliveryCommit.commit, reused: true }
  }
  const inspected = inspectExecutionWriter(input)
  const own = inspected.writers.find(writer => writer.executionId === input.executionId)
  requireCondition(own?.ownerSessionId === input.sessionId && own.scopeFingerprint === input.expectedScopeFingerprint
    && inspected.head === input.expectedHead, 'EXECUTION_CONTEXT_MISMATCH', 'HEAD 或本执行内容已变化；重新查询后审阅，不重复旧提交请求')
  checkExecution(input)
  // Verify before staging; only the staging equality check is deferred until our paths are staged.
  checkDelivery(record, false)
  const paths = [...new Set([
    ...git(record.project, ['--literal-pathspecs', 'diff', 'HEAD', '--name-only', '--no-renames', '-z', '--', ...own.scopedPaths]).split('\0'),
    ...git(record.project, ['--literal-pathspecs', 'ls-files', '--others', '--exclude-standard', '-z', '--', ...own.scopedPaths]).split('\0'),
  ].filter(Boolean))]
  requireCondition(paths.length, 'COMMIT_EMPTY', '本执行没有待提交文件；核对已有提交后 finish_execution')
  signal?.throwIfAborted()
  git(record.project, ['--literal-pathspecs', 'add', '--', ...paths])
  checkDelivery(record)
  const inputFiles = record.verification!.inputFiles
  const verifiedBlobs = blobMap(git(record.project, ['--literal-pathspecs', 'ls-files', '--stage', '-z', '--', ...inputFiles]))
  for (const file of inputFiles) requireCondition(fs.existsSync(safePath(record.project, file)) === verifiedBlobs.has(file),
    'VERIFICATION_INPUT_UNCOMMITTED', `验证输入没有可提交的索引快照：${file}；核对归属并补齐执行范围`)
  // Do not hold the Forge store transaction while Git hooks call governance tools.
  const { stdout } = await promisify(execFile)('git', ['--literal-pathspecs', '-c', 'core.abbrev=40', 'commit', '--only', '-m', input.message, '--', ...paths],
    { cwd: record.project, encoding: 'utf8', windowsHide: true, signal, timeout: 120000, maxBuffer: 1024 * 1024 })
  const commit = stdout.match(/^\[[^\r\n]* ([a-f0-9]{40,64})\]/m)?.[1]
  requireCondition(commit && git(record.project, ['rev-parse', `${commit}^`]) === input.expectedHead,
    'COMMIT_RESULT_UNCERTAIN', '提交返回身份或父版本发生变化；先核对 Git 记录，不自动重试提交')
  const committedPaths = git(record.project, ['diff-tree', '--no-commit-id', '--name-only', '--no-renames', '-r', '-z', commit]).split('\0').filter(Boolean)
  requireCondition(committedPaths.every(file => paths.includes(file)), 'COMMIT_RESULT_UNCERTAIN', 'Hook 改变了提交范围；保留现场并核对，不自动结束执行')
  const committedBlobs = blobMap(git(record.project, ['--literal-pathspecs', 'ls-tree', '-rz', '--full-tree', commit, '--', ...inputFiles]))
  for (const file of inputFiles) {
    requireCondition(committedBlobs.get(file) === verifiedBlobs.get(file), 'COMMIT_RESULT_UNCERTAIN', `提交内容与验证快照不一致：${file}；保留提交并重新核对证据`)
  }
  return locked(record.project, () => {
    const current = loadExecution(record.project, input.sessionId)
    requireCondition(current?.executionId === record.executionId && !current.release
      && current.discovery.discoveryId === record.discovery.discoveryId
      && current.verification?.fingerprint === record.verification!.fingerprint
      && inputFingerprint(record.project, record.verification!.inputFiles) === record.verification!.fingerprint,
      'COMMIT_RESULT_UNCERTAIN', '提交后执行或验证输入变化；保留提交，重新核对证据，不能直接结束')
    current.deliveryCommit = { requestFingerprint, commit }
    saveJson(statePath(record.project, record.executionId), current)
    return { allowed: true, code: 'PASS', commit, files: paths, reused: false, message: '本执行已提交；其他暂存内容保留，尚未 finish_execution' }
  })
}

function blobMap(output: string) {
  const result = new Map<string, string>()
  for (const entry of output.split('\0').filter(Boolean)) {
    const match = entry.match(/^[0-7]+ (?:blob )?([a-f0-9]+)(?: 0)?\t(.*)$/s)
    requireCondition(match, 'COMMIT_INDEX_INVALID', '索引存在冲突或非普通 blob，先核对 Git 状态')
    result.set(match[2], match[1])
  }
  return result
}
