import path from 'node:path'
import { execFile } from 'node:child_process'
import { requireCondition, ResolutionError } from '../specResolution/contracts.js'
import { locked, safePath, saveJson, statePath } from '../specResolution/storage.js'
import { runExecutionSchema } from './contracts.js'
import { checkExecution, loadExecution, type Execution } from './service.js'
import { inputFingerprint } from './repository.js'
import { isBranchMutation } from './policy.js'
import { EXECUTION_VERIFICATION_CALL_BUDGET_MS } from './budget.js'

export type VerificationProgress = {
  checkIndex: number; checkCount: number; kind: string;
  phase: 'started' | 'waiting' | 'output' | 'completed'; elapsedMs: number
}

export type VerificationRuntime = {
  signal?: AbortSignal
  onProgress?: (progress: VerificationProgress) => void
}

function requireActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ResolutionError('VERIFICATION_CANCELLED', '验证调用已取消；未记录本次结果')
}

function emitProgress(runtime: VerificationRuntime | undefined, progress: VerificationProgress): void {
  try { runtime?.onProgress?.(progress) } catch { /* Progress is advisory; checks remain authoritative. */ }
}

/** Execute declared checks ourselves; never accept an Agent-supplied PASS as evidence. */
export async function runExecutionVerification(raw: unknown, runtime?: VerificationRuntime) {
  const input = runExecutionSchema.parse(raw)
  requireCondition(input.checks.length * input.timeoutMs <= EXECUTION_VERIFICATION_CALL_BUDGET_MS,
    'VERIFICATION_BUDGET_EXCEEDED', '单次验证预算超过 4 分钟；使用相同 inputFiles 分批运行检查，结果按输入摘要累积')
  requireActive(runtime?.signal)
  checkExecution(input)
  const record = loadExecution(input.project, input.sessionId)!
  const inputFiles = [...new Set([...record.discovery.files, ...record.assessment.evidence.map(item => item.path),
    ...record.assessment.designFiles.map(item => item.path), ...input.inputFiles])]
  const fingerprint = inputFingerprint(record.project, inputFiles)
  const results: NonNullable<Execution['verification']>['results'] = []
  for (const [index, check] of input.checks.entries()) {
    requireActive(runtime?.signal)
    const cwd = safePath(record.project, check.cwd)
    requireCondition(!isBranchMutation([check.program, ...check.args].join(' ')), 'BRANCH_POLICY_DENIED', '验证入口也不能创建或切换分支')
    requireCondition(!['cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe', 'bash', 'sh'].includes(path.basename(check.program).toLowerCase()),
      'CHECK_COMMAND_INVALID', '验证使用明确 executable + argv，不接受通用 Shell；不得通过验证命令启动或重启服务')
    const started = Date.now()
    const progress = (phase: VerificationProgress['phase']) => emitProgress(runtime, {
      checkIndex: index + 1, checkCount: input.checks.length, kind: check.kind,
      phase, elapsedMs: Date.now() - started,
    })
    progress('started')
    const heartbeat = setInterval(() => progress('waiting'), 10_000)
    heartbeat.unref?.()
    const result = await new Promise<{ status: string; diagnostic: string }>(resolve => {
      let completed: { status: string; diagnostic: string } | undefined
      const child = execFile(check.program, check.args, { cwd, windowsHide: true, timeout: input.timeoutMs,
        maxBuffer: 1024 * 1024, encoding: 'utf8', signal: runtime?.signal },
        (error, stdout, stderr) => { completed = { status: error ? 'FAILED' : 'PASSED',
          diagnostic: String(error ? `${error.message}\n${stderr}\n${stdout}` : stdout).slice(-2000)
            .replace(/(token|password|secret)\s*[:=]\s*[^\s,}]+/gi, '$1=[REDACTED]') } })
      child.stdout?.on('data', () => progress('output'))
      child.stderr?.on('data', () => progress('output'))
      child.once('close', () => resolve(completed ?? { status: 'FAILED', diagnostic: '验证子进程无结果地退出' }))
    })
    clearInterval(heartbeat)
    requireActive(runtime?.signal)
    progress('completed')
    results.push({ kind: check.kind, purpose: check.purpose, command: [check.program, ...check.args], durationMs: Date.now() - started, ...result })
  }
  return locked(record.project, () => {
    requireActive(runtime?.signal)
    checkExecution(input)
    const current = loadExecution(record.project, input.sessionId)
    requireCondition(current?.executionId === record.executionId && fingerprint === inputFingerprint(record.project, inputFiles),
      'VERIFICATION_STALE', '验证期间执行上下文或输入变化；结果不能绑定当前工作区')
    const previous = current.verification?.fingerprint === fingerprint
      ? current.verification.results.filter(result => result.status === 'PASSED') : []
    const latest = new Map(previous.map(result => [JSON.stringify([result.kind, result.purpose, result.command]), result]))
    for (const result of results) latest.set(JSON.stringify([result.kind, result.purpose, result.command]), result)
    const merged = [...latest.values()]
    current.verification = { fingerprint, inputFiles, results: merged }
    saveJson(statePath(record.project, record.executionId), current)
    const missing = record.policy.verification.filter(kind => !merged.some(result => result.kind === kind && result.status === 'PASSED'))
    const allowed = !missing.length && merged.every(result => result.status === 'PASSED')
    return { allowed, code: allowed ? 'PASS' : 'VERIFICATION_INCOMPLETE', results: merged, missing,
      message: '进程退出码与内容指纹为真实证据；purpose 和测试是否覆盖业务语义仍需审阅，不代表已部署验收。' }
  })
}
