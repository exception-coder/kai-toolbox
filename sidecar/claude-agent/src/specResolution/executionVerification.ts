import path from 'node:path'
import { execFile } from 'node:child_process'
import { requireCondition } from './contracts.js'
import { locked, safePath, saveJson, statePath } from './storage.js'
import { runExecutionSchema } from './executionContracts.js'
import { checkExecution, inputFingerprint, loadExecution, isBranchMutation, type Execution } from './execution.js'

/** Execute declared checks ourselves; never accept an Agent-supplied PASS as evidence. */
export async function runExecutionVerification(raw: unknown) {
  const input = runExecutionSchema.parse(raw)
  checkExecution(input)
  const record = loadExecution(input.project, input.sessionId)!
  const inputFiles = [...new Set([...record.discovery.files, ...record.assessment.evidence.map(item => item.path),
    ...record.assessment.designFiles.map(item => item.path), ...input.inputFiles])]
  const fingerprint = inputFingerprint(record.project, inputFiles)
  const results: NonNullable<Execution['verification']>['results'] = []
  for (const check of input.checks) {
    const cwd = safePath(record.project, check.cwd)
    requireCondition(!isBranchMutation([check.program, ...check.args].join(' ')), 'BRANCH_POLICY_DENIED', '验证入口也不能创建或切换分支')
    requireCondition(!['cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe', 'bash', 'sh'].includes(path.basename(check.program).toLowerCase()),
      'CHECK_COMMAND_INVALID', '验证使用明确 executable + argv，不接受通用 Shell；不得通过验证命令启动或重启服务')
    const started = Date.now()
    const result = await new Promise<{ status: string; diagnostic: string }>(resolve => {
      execFile(check.program, check.args, { cwd, windowsHide: true, timeout: input.timeoutMs, maxBuffer: 1024 * 1024, encoding: 'utf8' },
        (error, stdout, stderr) => resolve({ status: error ? 'FAILED' : 'PASSED',
          diagnostic: String(error ? `${error.message}\n${stderr}\n${stdout}` : stdout).slice(-2000)
            .replace(/(token|password|secret)\s*[:=]\s*[^\s,}]+/gi, '$1=[REDACTED]') }))
    })
    results.push({ kind: check.kind, purpose: check.purpose, command: [check.program, ...check.args], durationMs: Date.now() - started, ...result })
  }
  return locked(record.project, () => {
    checkExecution(input)
    const current = loadExecution(record.project, input.sessionId)
    requireCondition(current?.executionId === record.executionId && fingerprint === inputFingerprint(record.project, inputFiles),
      'VERIFICATION_STALE', '验证期间执行上下文或输入变化；结果不能绑定当前工作区')
    current.verification = { fingerprint, inputFiles, results }
    saveJson(statePath(record.project, record.executionId), current)
    const missing = record.policy.verification.filter(kind => !results.some(result => result.kind === kind && result.status === 'PASSED'))
    const allowed = !missing.length && results.every(result => result.status === 'PASSED')
    return { allowed, code: allowed ? 'PASS' : 'VERIFICATION_INCOMPLETE', results, missing,
      message: '进程退出码与内容指纹为真实证据；purpose 和测试是否覆盖业务语义仍需审阅，不代表已部署验收。' }
  })
}
