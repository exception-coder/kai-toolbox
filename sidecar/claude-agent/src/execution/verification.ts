import path from 'node:path'
import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { requireCondition, ResolutionError } from '../specResolution/contracts.js'
import { hash, locked, saveJson, statePath } from '../specResolution/storage.js'
import { runExecutionSchema } from './contracts.js'
import { checkExecution, loadExecution, type Execution } from './service.js'
import { inputFingerprint } from './repository.js'
import { isBranchMutation } from './policy.js'
import { isDockerDependentCommand } from './dockerPolicy.js'
import { EXECUTION_VERIFICATION_CALL_BUDGET_MS } from './budget.js'
import { verificationCommand, verificationPath } from './verificationCommand.js'

export type VerificationProgress = {
  checkIndex: number; checkCount: number; kind: string;
  phase: 'started' | 'waiting' | 'output' | 'completed'; elapsedMs: number
}

export type VerificationRuntime = {
  signal?: AbortSignal
  budgetMs?: number
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
  requireActive(runtime?.signal)
  checkExecution(input)
  const record = loadExecution(input.project, input.sessionId)!
  const inputFiles = [...new Set([...record.discovery.files, ...record.assessment.evidence.map(item => item.path),
    ...record.assessment.designFiles.map(item => item.path), ...input.inputFiles.map(file =>
      path.relative(record.project, verificationPath(record.project, file)).replaceAll('\\', '/'))])].sort()
  const fingerprint = inputFingerprint(record.project, inputFiles)
  const results: NonNullable<Execution['verification']>['results'] = []
  const prepared = input.checks.map(check => {
    const cwd = verificationPath(record.project, check.cwd)
    requireCondition(fs.existsSync(cwd) && fs.statSync(cwd).isDirectory(), 'PATH_INVALID', `检查目录不存在：${check.cwd}`)
    if (check.replaces) requireCondition(record.verification?.fingerprint === fingerprint && record.verification.results.some(
      result => result.checkId === check.replaces && result.kind === check.kind && result.status === 'FAILED'),
    'CHECK_REPLACEMENT_INVALID', 'replaces 必须引用同一输入快照、同类别的失败 checkId')
    requireCondition(!isBranchMutation([check.program, ...check.args].join(' ')), 'BRANCH_POLICY_DENIED', '验证入口也不能创建或切换分支')
    requireCondition(!isDockerDependentCommand([check.program, ...check.args].join(' ')),
      'DOCKER_VERIFICATION_DENIED', 'Forge 验证不启动 Docker、WSL 或 Testcontainers；使用无需容器的检查，目标库实测另行验收')
    requireCondition(!['cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe', 'bash', 'sh'].includes(path.basename(check.program).toLowerCase()),
      'CHECK_COMMAND_INVALID', '验证使用明确 executable + argv，不接受通用 Shell；不得通过验证命令启动或重启服务')
    return { check, cwd, command: verificationCommand(check.program, check.args, cwd) }
  })
  const deadline = Date.now() + Math.min(runtime?.budgetMs ?? EXECUTION_VERIFICATION_CALL_BUDGET_MS, EXECUTION_VERIFICATION_CALL_BUDGET_MS)
  for (const [index, { check, cwd, command }] of prepared.entries()) {
    requireActive(runtime?.signal)
    if (Date.now() >= deadline) break
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
      const child = execFile(command.program, command.args, { cwd, windowsHide: true, timeout: Math.max(1, Math.min(input.timeoutMs, deadline - Date.now())),
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
    results.push({ checkId: `vc_${hash(JSON.stringify([check.kind, check.program, check.args, cwd])).slice(0, 32)}`,
      kind: check.kind, purpose: check.purpose, command: [check.program, ...check.args], durationMs: Date.now() - started, ...result })
  }
  return saveVerification({ record, input, inputFiles, fingerprint, results }, runtime)
}

function saveVerification(state: { record: Execution; input: ReturnType<typeof runExecutionSchema.parse>;
  inputFiles: string[]; fingerprint: string; results: NonNullable<Execution['verification']>['results'] }, runtime?: VerificationRuntime) {
  const { record, input, inputFiles, fingerprint, results } = state
  return locked(record.project, () => {
    requireActive(runtime?.signal)
    checkExecution(input)
    const current = loadExecution(record.project, input.sessionId)
    requireCondition(current?.executionId === record.executionId && fingerprint === inputFingerprint(record.project, inputFiles),
      'VERIFICATION_STALE', '验证期间执行上下文或输入变化；结果不能绑定当前工作区')
    const previous = current.verification?.fingerprint === fingerprint
      ? current.verification.results : []
    const identity = (result: typeof results[number]) => result.checkId ?? `vc_${hash(JSON.stringify([result.kind, result.command[0], result.command.slice(1), record.project])).slice(0, 32)}`
    const latest = new Map<string, typeof results[number]>(previous.map(result => [identity(result), { ...result, checkId: identity(result) }]))
    for (const [index, result] of results.entries()) {
      const replacement = input.checks[index].replaces
      if (replacement && result.status === 'PASSED') latest.delete(replacement)
      latest.set(identity(result), result)
    }
    const merged = [...latest.values()]
    const checkId = (check: { kind: string; program: string; args: string[]; cwd: string }) => JSON.stringify([check.kind, check.program, check.args, verificationPath(record.project, check.cwd)])
    const pending = new Map((current.verification?.fingerprint === fingerprint ? current.verification.pendingChecks ?? [] : [])
      .map(check => [checkId(check), check]))
    for (const check of input.checks.slice(0, results.length)) pending.delete(checkId(check))
    for (const check of input.checks.slice(results.length)) pending.set(checkId(check), check)
    const pendingChecks = [...pending.values()]
    current.verification = { fingerprint, inputFiles, results: merged, pendingChecks }
    saveJson(statePath(record.project, record.executionId), current)
    const missing = record.policy.verification.filter(kind => !merged.some(result => result.kind === kind && result.status === 'PASSED'))
    const failed = merged.some(result => result.status !== 'PASSED')
    const allowed = !missing.length && !failed && !pendingChecks.length
    return { allowed, batchStatus: failed ? 'FAILED' : 'PASSED',
      code: failed ? 'VERIFICATION_FAILED' : allowed ? 'PASS' : 'VERIFICATION_PENDING', results: merged, missing, pendingChecks,
      actions: failed ? ['修复后重跑失败检查；更换命令时用 replaces 指向同类别失败 checkId，替代检查通过后才解除阻断；不要重跑已通过项']
        : allowed ? [] : ['保留相同 inputFiles，仅运行 missing 类别或 pendingChecks；无需重跑已通过项，尚不可提交'],
      message: failed ? '存在实际失败检查，详见 results.diagnostic。' : allowed ? '验证类别已补齐；不代表已部署验收。' : '本批检查通过，整体验证尚待补齐；这不是工具执行失败。' }
  })
}
