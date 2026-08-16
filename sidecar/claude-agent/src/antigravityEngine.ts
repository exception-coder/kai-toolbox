import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { appendSqlDdlFallbackRule } from './pendingSqlPolicy.js'
import { prependWindowsExecutionInstructions } from './windowsExecution.js'
import { resolveAntigravityExecutable } from './antigravityRuntime.js'

const MAX_STDOUT_BUFFER = 2 * 1024 * 1024
const TURN_TIMEOUT_MS = 15 * 60 * 1_000 + 5_000
const IDLE_TIMEOUT_MS = 2 * 60 * 1_000

export interface AntigravityTurnCtx {
  text: string
  developerInstructions?: string
  additionalDirectories?: string[]
  cwd: string
  model?: string
  reasoningEffort?: string
  permissionMode: string
  sdkSessionId?: string
  signal: AbortSignal
  emit: (event: Record<string, unknown>) => void
  setSdkSessionId: (id: string) => void
}

export interface ParsedAntigravityLine {
  sessionId?: string
  events: Array<Record<string, unknown>>
}

function pickString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0)
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

function safeText(value: unknown): string {
  if (value == null) return ''
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > 8_000 ? `${text.slice(0, 8_000)}…(truncated)` : text
}

export function buildAntigravityArgs(ctx: Pick<AntigravityTurnCtx,
  'text' | 'developerInstructions' | 'additionalDirectories' | 'model' | 'reasoningEffort' | 'permissionMode' | 'sdkSessionId'>): string[] {
  const prompt = ctx.developerInstructions ? `${ctx.developerInstructions}\n\n${ctx.text}` : ctx.text
  const args = [
    '--print',
    prependWindowsExecutionInstructions(appendSqlDdlFallbackRule(prompt)),
    '--output-format',
    'stream-json',
    '--print-timeout',
    '15m',
  ]
  for (const directory of ctx.additionalDirectories ?? []) args.push('--add-dir', directory)
  if (ctx.model) args.push('--model', ctx.model)
  const effort = ctx.reasoningEffort?.toLowerCase()
  if (effort === 'low' || effort === 'medium' || effort === 'high') args.push('--effort', effort)
  if (ctx.sdkSessionId) args.push('--conversation', ctx.sdkSessionId)
  else args.push('--new-project')
  if (ctx.permissionMode === 'plan') args.push('--mode', 'plan')
  if (ctx.permissionMode === 'default' || ctx.permissionMode === 'acceptEdits') args.push('--mode', 'accept-edits')
  if (ctx.permissionMode === 'bypassPermissions') args.push('--dangerously-skip-permissions')
  return args
}

/** Tolerant JSONL mapping; provider-native fields never escape this adapter. */
export function parseAntigravityLine(line: string): ParsedAntigravityLine {
  const object = JSON.parse(line) as Record<string, unknown>
  const nested = asObject(object.message)
  const stepUpdate = asObject(object.step_update)
  const result = asObject(object.result)
  const error = asObject(object.error)
  const sessionId = pickString(
    object.conversation_id, object.conversationId, object.session_id, object.sessionId,
    stepUpdate?.conversation_id, result?.conversation_id,
  )
  const type = pickString(object.type, object.event, object.kind)?.toLowerCase()
  const events: Array<Record<string, unknown>> = []
  if (type === 'step_update') {
    const stepType = pickString(stepUpdate?.step_type)?.toLowerCase()
    const state = pickString(stepUpdate?.state)?.toUpperCase()
    const toolInfo = asObject(stepUpdate?.tool_info)
    const text = pickString(stepUpdate?.text_delta, stepUpdate?.text, stepUpdate?.content)
    if (text) events.push({ type: 'assistantDelta', text })
    if (stepType === 'error_message') {
      const message = pickString(
        stepUpdate?.error_message,
        stepUpdate?.message,
        stepUpdate?.error,
        toolInfo?.error,
      )
      if (message) events.push({ type: 'error', code: 'ANTIGRAVITY_ERROR', message })
    }
    if (stepType === 'tool' && state === 'ACTIVE') {
      events.push({
        type: 'toolUse',
        toolCallId: `antigravity-step-${String(stepUpdate?.step_index ?? 'unknown')}`,
        toolName: pickString(stepUpdate?.tool_name, toolInfo?.name) ?? 'tool',
        input: toolInfo?.parameters ?? {},
      })
    }
    if (stepType === 'tool' && state !== 'ACTIVE') {
      const toolError = asObject(toolInfo?.error)
      events.push({
        type: 'toolResult',
        toolCallId: `antigravity-step-${String(stepUpdate?.step_index ?? 'unknown')}`,
        toolName: pickString(stepUpdate?.tool_name, toolInfo?.name) ?? 'tool',
        output: safeText(toolInfo?.output ?? toolError?.message),
        isError: state === 'ERROR' || Boolean(toolInfo?.error),
      })
    }
  } else if (type === 'message' || type === 'assistant' || type === 'assistant_delta' || type === 'content_block_delta') {
    const role = pickString(object.role, nested?.role)
    const text = pickString(object.delta, object.text, object.content, object.response, nested?.text, nested?.content)
    if (role !== 'user' && text) events.push({ type: 'assistantDelta', text })
  } else if (type === 'tool_use' || type === 'tool_call') {
    events.push({
      type: 'toolUse',
      toolCallId: pickString(object.tool_id, object.toolId, object.id) ?? `antigravity-tool-${Date.now()}`,
      toolName: pickString(object.name, object.tool, object.tool_name) ?? 'tool',
      input: object.input ?? object.arguments ?? object.parameters ?? {},
    })
  } else if (type === 'tool_result') {
    events.push({
      type: 'toolResult',
      toolCallId: pickString(object.tool_id, object.toolId, object.id) ?? 'antigravity-tool',
      toolName: pickString(object.name, object.tool, object.tool_name) ?? 'tool',
      output: safeText(object.output ?? object.result ?? object.content ?? object.error),
      isError: Boolean(object.error || object.is_error || object.isError || object.status === 'failed'),
    })
  } else if (type === 'error') {
    events.push({
      type: 'error',
      code: 'ANTIGRAVITY_ERROR',
      message: pickString(
        object.message,
        typeof object.error === 'string' ? object.error : undefined,
        error?.message,
      ) ?? 'Antigravity 执行失败',
    })
  } else if (type === 'result' || type === 'completed' || type === 'completion') {
    const status = pickString(result?.status, object.status)?.toUpperCase()
    const response = pickString(object.response, object.text, object.content, result?.response, result?.text, result?.content)
    if (response) events.push({ type: 'assistantDelta', text: response, finalFallback: true })
    if (status && status !== 'SUCCESS') {
      events.push({
        type: 'error',
        code: `ANTIGRAVITY_${status}`,
        message: pickString(result?.error, object.error, result?.message, object.message) ?? `Antigravity 执行${status}`,
      })
    } else {
      events.push({ type: 'result', usage: object.usage ?? object.stats ?? result?.usage ?? result?.stats ?? {}, stopReason: 'end_turn' })
    }
  }
  return { sessionId, events }
}

export function summarizeAntigravityError(stderr: string, exitCode: number | null): string {
  const lines = stderr.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const diagnostic = lines.find(line => /^(invalid|error|failed|fatal|unknown)\b/i.test(line))
    ?? lines.find(line => !/^Usage of |^Available subcommands:|^--?\w|^[a-z]+\s{2,}/i.test(line))
  return diagnostic?.slice(0, 500) || `agy 退出码 ${exitCode ?? 'unknown'}`
}

export function explainAntigravityFailure(rawDiagnostic: string, fallback: string): string {
  const diagnostic = rawDiagnostic.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '***').slice(-16_000)
  const authenticated = /ChainedAuth: authenticated|authenticated successfully/i.test(diagnostic)
  if (/User location is not supported for the API use/i.test(diagnostic)) {
    return 'Antigravity CLI 已登录，但当前网络出口地区不受支持（User location is not supported）。请切换到 Antigravity 支持的网络环境后重试。'
  }
  if (!authenticated && /You are not logged into Antigravity|not logged in/i.test(diagnostic)) {
    return 'Antigravity CLI 尚未完成登录，请先在同一 Windows 用户下打开终端运行 agy 并完成登录。'
  }
  const providerError = diagnostic.split(/\r?\n/)
    .map(line => line.trim())
    .find(line => /(FAILED_PRECONDITION|PERMISSION_DENIED|UNAUTHENTICATED|RESOURCE_EXHAUSTED|quota\s+(?:exceeded|exhausted|limit)|rate[\s_-]*limit)/i.test(line))
  return providerError?.replace(/^.*?(FAILED_PRECONDITION|PERMISSION_DENIED|UNAUTHENTICATED|RESOURCE_EXHAUSTED)/i, '$1').slice(0, 500)
    || fallback
}

export function resolveAntigravityTerminal(input: {
  aborted: boolean
  timedOut: boolean
  idleTimedOut: boolean
  exitCode: number | null
  sawText: boolean
  pendingResult?: Record<string, unknown>
  pendingError?: Record<string, unknown>
  diagnostic: string
}): Record<string, unknown> {
  if (input.aborted) return { type: 'result', usage: {}, stopReason: 'interrupted' }
  if (input.timedOut) {
    return {
      type: 'error',
      code: 'ANTIGRAVITY_TIMEOUT',
      message: input.idleTimedOut
        ? 'Antigravity 超过 2 分钟没有产生任何事件，可能正在等待不可见的权限确认，已终止'
        : 'Antigravity 单轮执行超过 15 分钟，已终止',
    }
  }
  if (input.pendingError || input.exitCode !== 0) {
    const fallback = typeof input.pendingError?.message === 'string'
      ? input.pendingError.message
      : summarizeAntigravityError(input.diagnostic, input.exitCode)
    return {
      type: 'error',
      code: typeof input.pendingError?.code === 'string'
        ? input.pendingError.code
        : `ANTIGRAVITY_EXIT_${input.exitCode}`,
      message: explainAntigravityFailure(input.diagnostic, fallback),
    }
  }
  if (input.pendingResult && input.sawText) return input.pendingResult
  if (input.pendingResult) {
    return {
      type: 'error',
      code: 'ANTIGRAVITY_EMPTY_RESPONSE',
      message: explainAntigravityFailure(input.diagnostic, 'Antigravity 在生成或工具调用阶段提前结束，未返回可见回复；原会话上下文已保留，请重试本轮。'),
    }
  }
  if (input.sawText) return { type: 'result', usage: {}, stopReason: 'end_turn' }
  return {
    type: 'error',
    code: 'ANTIGRAVITY_EMPTY_RESPONSE',
    message: explainAntigravityFailure(input.diagnostic, 'Antigravity 未返回结构化结果。'),
  }
}

function createTurnLogPath(): string | undefined {
  const home = process.env.USERPROFILE || process.env.HOME
  if (!home) return undefined
  try {
    const directory = join(home, '.kai-toolbox', 'antigravity-turn-logs')
    mkdirSync(directory, { recursive: true })
    return join(directory, `${randomUUID()}.log`)
  } catch {
    return undefined
  }
}

function readAndRemoveTurnLog(path: string | undefined): string {
  if (!path) return ''
  try {
    return readFileSync(path, 'utf8').slice(-32_000)
  } catch {
    return ''
  } finally {
    try { rmSync(path, { force: true }) } catch { /* ignore */ }
  }
}

export async function runAntigravityTurn(ctx: AntigravityTurnCtx): Promise<void> {
  const cwd = existsSync(ctx.cwd) ? ctx.cwd : (process.env.USERPROFILE || process.env.HOME || process.cwd())
  const executable = resolveAntigravityExecutable()
  const args = buildAntigravityArgs(ctx)
  const turnLogPath = createTurnLogPath()
  if (turnLogPath) args.push('--log-file', turnLogPath)
  return new Promise(resolve => {
    let child: ChildProcess
    try {
      child = spawn(executable, args, { cwd, env: { ...process.env }, windowsHide: true })
    } catch (error) {
      ctx.emit({ type: 'error', code: 'ANTIGRAVITY_SPAWN_FAILED', message: error instanceof Error ? error.message : String(error) })
      resolve()
      return
    }
    let stdoutBuffer = ''
    let stderr = ''
    let sawText = false
    let pendingResult: Record<string, unknown> | undefined
    let pendingError: Record<string, unknown> | undefined
    let reportedSessionId = ctx.sdkSessionId
    let timedOut = false
    let idleTimedOut = false
    let finished = false
    let idleTimer: NodeJS.Timeout
    const resetIdleTimer = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        timedOut = true
        idleTimedOut = true
        try { child.kill() } catch { /* ignore */ }
      }, IDLE_TIMEOUT_MS)
    }
    const onAbort = () => { try { child.kill() } catch { /* ignore */ } }
    ctx.signal.addEventListener('abort', onAbort, { once: true })
    const timeout = setTimeout(() => {
      timedOut = true
      try { child.kill() } catch { /* ignore */ }
    }, TURN_TIMEOUT_MS)
    resetIdleTimer()
    const processLine = (raw: string): void => {
      const line = raw.trim()
      if (!line) return
      resetIdleTimer()
      try {
        const parsed = parseAntigravityLine(line)
        if (parsed.sessionId && parsed.sessionId !== reportedSessionId) {
          reportedSessionId = parsed.sessionId
          ctx.setSdkSessionId(parsed.sessionId)
          ctx.emit({ type: 'init', sdkSessionId: parsed.sessionId })
        }
        for (const event of parsed.events) {
          if (event.type === 'assistantDelta') {
            if (event.finalFallback && sawText) continue
            sawText = true
          }
          if (event.type === 'result') {
            pendingResult = event
            continue
          }
          if (event.type === 'error') {
            pendingError = event
            continue
          }
          const { finalFallback: _finalFallback, ...publicEvent } = event
          ctx.emit(publicEvent)
        }
      } catch {
        console.warn('[antigravity] ignored non-JSON output:', line.slice(0, 200))
      }
    }
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdoutBuffer += chunk
      if (stdoutBuffer.length > MAX_STDOUT_BUFFER) {
        stderr = 'Antigravity 单条结构化输出超过 2 MiB 安全上限'
        try { child.kill() } catch { /* ignore */ }
        return
      }
      let newline = stdoutBuffer.indexOf('\n')
      while (newline >= 0) {
        processLine(stdoutBuffer.slice(0, newline))
        stdoutBuffer = stdoutBuffer.slice(newline + 1)
        newline = stdoutBuffer.indexOf('\n')
      }
    })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-8_000) })
    child.on('error', error => {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      clearTimeout(idleTimer)
      ctx.signal.removeEventListener('abort', onAbort)
      readAndRemoveTurnLog(turnLogPath)
      ctx.emit({ type: 'error', code: 'ANTIGRAVITY_SPAWN_FAILED', message: error.message })
      resolve()
    })
    child.on('close', code => {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      clearTimeout(idleTimer)
      ctx.signal.removeEventListener('abort', onAbort)
      processLine(stdoutBuffer)
      const logText = readAndRemoveTurnLog(turnLogPath)
      const diagnostic = `${stderr}\n${logText}`
      ctx.emit(resolveAntigravityTerminal({
        aborted: ctx.signal.aborted,
        timedOut,
        idleTimedOut,
        exitCode: code,
        sawText,
        pendingResult,
        pendingError,
        diagnostic,
      }))
      resolve()
    })
  })
}
