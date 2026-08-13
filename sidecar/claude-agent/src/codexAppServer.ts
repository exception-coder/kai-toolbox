import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createRequire } from 'node:module'
import { createInterface } from 'node:readline'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { activityOutputTail, elapsedSince, emitToolActivity, summarizeToolInput } from './toolActivity.js'
import { classifyCommandResult } from './commandExecution.js'
import type { RequiredMcpTool } from './codexSecurity.js'

const require = createRequire(import.meta.url)
const REQUEST_TIMEOUT_MS = 20_000
const MODEL_PAGE_SIZE = 100
const MAX_MODEL_PAGES = 20
const MAX_COMMAND_OUTPUT_CHARS = 8_000
const COMMAND_OUTPUT_EMIT_INTERVAL_MS = 250

type JsonRpcResponse = {
  id?: number
  result?: JsonRpcResult
  error?: {
    code?: number
    message?: string
  }
}

type JsonRpcResult = {
  thread?: {
    id?: string
    turns?: Array<{ id?: string }>
  }
  data?: AppServerModel[]
  nextCursor?: string | null
}

type AppServerModel = {
  id?: string
  model?: string
  displayName?: string
  description?: string
  hidden?: boolean
  defaultReasoningEffort?: string
  supportedReasoningEfforts?: Array<{ reasoningEffort?: string }>
  additionalSpeedTiers?: string[]
}

export type CodexModelInfo = {
  value: string
  displayName: string
  description: string
  reasoningEfforts: string[]
  defaultReasoningEffort: string | null
  fastSupported: boolean
}

type CommandActivityState = {
  command: string
  cwd: string
  output: string
  startedAt: number
}

type AppServerTurnOptions = {
  threadId?: string
  cwd: string
  model?: string
  reasoningEffort?: string
  sandbox: 'read-only' | 'workspace-write' | 'danger-full-access'
  approvalPolicy: 'never' | 'on-request' | 'on-failure' | 'untrusted'
  config?: Record<string, unknown>
  input: Array<Record<string, unknown>>
  codexHome?: string
  signal: AbortSignal
  emit: (event: Record<string, unknown>) => void
  setThreadId: (threadId: string) => void
  mcpServers?: Array<{ name: string; status: string }>
  requiredMcpTools?: RequiredMcpTool[]
}

type PendingRequest = {
  resolve: (result: Record<string, unknown>) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

export class CodexAppServerTurnError extends Error {
  constructor(message: string, readonly retrySafe: boolean) {
    super(message)
    this.name = 'CodexAppServerTurnError'
  }
}

type McpRuntimeStatus = {
  name: string
  tools: Set<string>
}

function parseMcpRuntimeStatuses(result: JsonRpcResult): McpRuntimeStatus[] {
  return (result.data ?? []).map(item => {
    const record = asRecord(item) ?? {}
    const tools = asRecord(record.tools) ?? {}
    return {
      name: asString(record.name),
      tools: new Set(Object.keys(tools)),
    }
  }).filter(status => status.name)
}

function validateRequiredMcpTools(statuses: McpRuntimeStatus[], required: RequiredMcpTool[]): void {
  const missing = required.filter(expected => {
    const server = statuses.find(status => status.name === expected.server)
    return !server?.tools.has(expected.tool)
  })
  if (missing.length === 0) return
  const names = missing.map(item => `${item.server}.${item.tool}`).join('、')
  throw new CodexAppServerTurnError(`业务咨询只读工具初始化失败，缺少运行时 Tool：${names}`, false)
}

function normalizeCodexHome(value?: string): string | undefined {
  const raw = value?.trim()
  if (!raw) return undefined
  return resolve(raw
    .replace(/^~(?=[\\/]|$)/, homedir())
    .replace(/%([^%]+)%/g, (_, name: string) => process.env[name] ?? `%${name}%`)
    .replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/gi, (_, name: string) => process.env[name] ?? `$env:${name}`))
}

function appServerEnv(codexHome?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  // 业务会话必须使用它自己选择的授权目录，不能继承启动 kai-toolbox 的 Codex 会话身份。
  delete env.CODEX_THREAD_ID
  delete env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE
  const home = normalizeCodexHome(codexHome)
  if (home) env.CODEX_HOME = home
  return env
}

function codexCliEntrypoint(): string {
  const packageJson = require.resolve('@openai/codex/package.json')
  return join(dirname(packageJson), 'bin', 'codex.js')
}

function stop(child: ChildProcessWithoutNullStreams): void {
  if (!child.stdin.destroyed) child.stdin.end()
  if (!child.killed) child.kill()
}

function isReasoningEffort(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(value)
}

function callAppServer(
  method: string,
  params: Record<string, unknown>,
  codexHome?: string,
): Promise<JsonRpcResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      [codexCliEntrypoint(), 'app-server', '--stdio'],
      {
        env: appServerEnv(codexHome),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    )
    const lines = createInterface({ input: child.stdout })
    let stderr = ''
    let settled = false

    const finish = (error?: Error, result?: JsonRpcResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      lines.close()
      stop(child)
      if (error) rejectPromise(error)
      else resolvePromise(result ?? {})
    }

    const send = (message: Record<string, unknown>) => {
      child.stdin.write(JSON.stringify(message) + '\n')
    }

    const timer = setTimeout(() => {
      const detail = stderr.trim()
      finish(new Error(`Codex ${method} 超时${detail ? `：${detail}` : ''}`))
    }, REQUEST_TIMEOUT_MS)

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => {
      stderr = (stderr + String(chunk)).slice(-4000)
    })
    child.on('error', error => finish(error))
    child.on('exit', code => {
      if (!settled) {
        const detail = stderr.trim()
        finish(new Error(`Codex App Server 异常退出（${code ?? 'unknown'}）${detail ? `：${detail}` : ''}`))
      }
    })

    lines.on('line', line => {
      let message: JsonRpcResponse
      try {
        message = JSON.parse(line) as JsonRpcResponse
      } catch {
        return
      }
      if (message.id === 0) {
        if (message.error) {
          finish(new Error(message.error.message ?? 'Codex App Server 初始化失败'))
          return
        }
        send({ method: 'initialized', params: {} })
        send({
          method,
          id: 1,
          params,
        })
        return
      }
      if (message.id !== 1) return
      if (message.error) {
        finish(new Error(message.error.message ?? `Codex ${method} 失败（${message.error.code ?? 'unknown'}）`))
        return
      }
      finish(undefined, message.result)
    })

    send({
      method: 'initialize',
      id: 0,
      params: {
        clientInfo: {
          name: 'kai_toolbox',
          title: 'Kai Toolbox',
          version: '0.1.0',
        },
      },
    })
  })
}

/** Returns the picker-visible model catalog for the selected Codex authorization directory. */
export async function listCodexModels(codexHome?: string): Promise<CodexModelInfo[]> {
  const models: CodexModelInfo[] = []
  const seenCursors = new Set<string>()
  let cursor: string | undefined

  for (let page = 0; page < MAX_MODEL_PAGES; page += 1) {
    const result = await callAppServer('model/list', {
      limit: MODEL_PAGE_SIZE,
      includeHidden: false,
      ...(cursor ? { cursor } : {}),
    }, codexHome)

    for (const item of result.data ?? []) {
      const value = item.model?.trim() || item.id?.trim()
      if (!value || item.hidden === true) continue
      const reasoningEfforts = (item.supportedReasoningEfforts ?? [])
        .map(option => option.reasoningEffort)
        .filter(isReasoningEffort)
      models.push({
        value,
        displayName: item.displayName?.trim() || value,
        description: item.description ?? '',
        reasoningEfforts,
        defaultReasoningEffort: isReasoningEffort(item.defaultReasoningEffort)
          ? item.defaultReasoningEffort
          : null,
        fastSupported: (item.additionalSpeedTiers ?? []).includes('fast'),
      })
    }

    const nextCursor = result.nextCursor?.trim()
    if (!nextCursor || seenCursors.has(nextCursor)) break
    seenCursors.add(nextCursor)
    cursor = nextCursor
  }

  return models
}

/** 通过 Codex App Server 的稳定 thread/fork API 复制到指定 turn（含）为止。 */
export async function forkCodexThread(
  threadId: string,
  options: { lastTurnId?: string; codexHome?: string } = {},
): Promise<string> {
  const result = await callAppServer('thread/fork', {
    threadId,
    ...(options.lastTurnId ? { lastTurnId: options.lastTurnId } : {}),
  }, options.codexHome)
  const forkedId = result.thread?.id
  if (!forkedId) throw new Error('Codex thread/fork 未返回新 thread id')
  return forkedId
}

/** 读取当前 thread 最新一轮的 turn id，作为消息底部“从这里分叉”的锚点。 */
export async function latestCodexTurnId(threadId: string, codexHome?: string): Promise<string | undefined> {
  const result = await callAppServer('thread/read', { threadId, includeTurns: true }, codexHome)
  const turns = result.thread?.turns ?? []
  return turns.at(-1)?.id
}

/**
 * 通过 App Server 执行一轮并转换客户端级流式事件。
 * 每轮独立进程使 Auth 目录天然隔离；失败是否允许 SDK 重试由 retrySafe 明确表达。
 */
export async function runCodexAppServerTurn(options: AppServerTurnOptions): Promise<void> {
  const child = spawn(process.execPath, [codexCliEntrypoint(), 'app-server', '--stdio'], {
    env: appServerEnv(options.codexHome),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const lines = createInterface({ input: child.stdout })
  const pending = new Map<number, PendingRequest>()
  let nextId = 1
  let stderr = ''
  let initialized = false
  let emittedActivity = false
  let threadId = options.threadId
  let turnId: string | undefined
  let turnAccepted = false
  let finished = false
  let lastUsage: Record<string, unknown> = {}
  let abortFallback: NodeJS.Timeout | undefined
  let abortCompletion: ((error: Error) => void) | undefined
  const commandActivities = new Map<string, CommandActivityState>()
  const commandActivityEmittedAt = new Map<string, number>()

  const cleanup = () => {
    if (finished) return
    finished = true
    options.signal.removeEventListener('abort', onAbort)
    if (abortFallback) clearTimeout(abortFallback)
    lines.close()
    stop(child)
  }
  const failPending = (error: Error) => {
    for (const request of pending.values()) {
      clearTimeout(request.timer)
      request.reject(error)
    }
    pending.clear()
  }
  const send = (message: Record<string, unknown>) => {
    if (child.stdin.destroyed) throw new Error('Codex App Server stdin 已关闭')
    child.stdin.write(JSON.stringify(message) + '\n')
  }
  const request = (method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const id = nextId++
    return new Promise((resolveRequest, rejectRequest) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        rejectRequest(new Error(`Codex App Server 请求 ${method} 超时（${REQUEST_TIMEOUT_MS}ms）`))
      }, REQUEST_TIMEOUT_MS)
      timer.unref?.()
      pending.set(id, { resolve: resolveRequest, reject: rejectRequest, timer })
      send({ method, id, params })
    })
  }
  const emitActivity = (event: Record<string, unknown>) => {
    emittedActivity = true
    options.emit(event)
  }
  const onAbort = () => {
    if (threadId && turnId && initialized) {
      void request('turn/interrupt', { threadId, turnId }).catch(() => undefined)
      abortFallback = setTimeout(() => {
        abortCompletion?.(new Error('Codex App Server 中断后未返回终态，已强制清理'))
      }, 2_500)
      abortFallback.unref?.()
      return
    }
    abortCompletion?.(new Error('Codex App Server 执行已中断'))
  }
  options.signal.addEventListener('abort', onAbort, { once: true })

  const completion = new Promise<void>((resolveCompletion, rejectCompletion) => {
    const finishError = (error: Error) => {
      failPending(error)
      cleanup()
      rejectCompletion(new CodexAppServerTurnError(error.message, !turnAccepted && !emittedActivity))
    }
    abortCompletion = finishError

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-4000) })
    child.on('error', finishError)
    child.on('exit', code => {
      if (finished) return
      const detail = stderr.trim()
      finishError(new Error(`Codex App Server 异常退出（${code ?? 'unknown'}）${detail ? `：${detail}` : ''}`))
    })

    lines.on('line', line => {
      let message: Record<string, unknown>
      try {
        message = JSON.parse(line) as Record<string, unknown>
      } catch {
        return
      }
      if (typeof message.id === 'number') {
        const requestState = pending.get(message.id)
        if (!requestState) return
        pending.delete(message.id)
        clearTimeout(requestState.timer)
        const error = asRecord(message.error)
        if (error) requestState.reject(new Error(asString(error.message) || 'Codex App Server 请求失败'))
        else requestState.resolve(asRecord(message.result) ?? {})
        return
      }
      const method = asString(message.method)
      const params = asRecord(message.params) ?? {}
      if (!method) return
      switch (method) {
        case 'item/agentMessage/delta': {
          const text = asString(params.delta)
          if (text) emitActivity({ type: 'assistantDelta', text })
          break
        }
        case 'item/started':
        case 'item/completed': {
          const item = asRecord(params.item)
          handleAppServerItem(
            method === 'item/completed' ? 'completed' : 'inProgress',
            item,
            emitActivity,
            commandActivities,
          )
          const commandItemId = asString(item?.id)
          if (asString(item?.type) === 'commandExecution' && commandItemId) {
            if (method === 'item/completed') commandActivityEmittedAt.delete(commandItemId)
            else commandActivityEmittedAt.set(commandItemId, Date.now())
          }
          break
        }
        case 'item/commandExecution/outputDelta': {
          const itemId = asString(params.itemId)
          const delta = asString(params.delta)
          if (!itemId || !delta) break
          const state = commandActivities.get(itemId) ?? { command: '', cwd: '', output: '', startedAt: Date.now() }
          state.output = tail(state.output + delta, MAX_COMMAND_OUTPUT_CHARS)
          commandActivities.set(itemId, state)
          const now = Date.now()
          if (now - (commandActivityEmittedAt.get(itemId) ?? 0) >= COMMAND_OUTPUT_EMIT_INTERVAL_MS) {
            commandActivityEmittedAt.set(itemId, now)
            emitCommandActivity(emitActivity, itemId, 'inProgress', state)
          }
          break
        }
        case 'turn/plan/updated':
          emitActivity({
            type: 'codexActivity', activityType: 'plan', itemId: asString(params.turnId),
            status: 'inProgress', title: asString(params.explanation) || '执行计划', data: params.plan ?? [],
          })
          break
        case 'turn/diff/updated':
          emitActivity({
            type: 'codexActivity', activityType: 'diff', itemId: asString(params.turnId),
            status: 'inProgress', title: '本轮文件变更', detail: asString(params.diff),
          })
          break
        case 'thread/tokenUsage/updated': {
          const usage = asRecord(params.tokenUsage)
          lastUsage = asRecord(usage?.last) ?? lastUsage
          const outputTokens = asNumber(lastUsage.outputTokens) + asNumber(lastUsage.reasoningOutputTokens)
          options.emit({ type: 'turnProgress', outputTokens })
          break
        }
        case 'model/rerouted':
          emitActivity({
            type: 'codexActivity', activityType: 'model', itemId: asString(params.turnId),
            status: 'completed', title: '模型已自动路由',
            detail: `${asString(params.fromModel)} → ${asString(params.toModel)}${asString(params.reason) ? `：${asString(params.reason)}` : ''}`,
          })
          break
        case 'warning':
        case 'configWarning':
          options.emit({ type: 'warning', code: 'CODEX_APP_SERVER_WARNING', message: notificationMessage(params) })
          break
        case 'error':
          finishError(new Error(notificationMessage(asRecord(params.error) ?? params)))
          break
        case 'turn/completed': {
          const turn = asRecord(params.turn)
          const status = asString(turn?.status) || 'completed'
          const completedTurnId = asString(turn?.id) || turnId
          if (status === 'failed') {
            const turnError = asRecord(turn?.error)
            options.emit({
              type: 'error',
              code: 'CODEX_APP_SERVER_TURN_FAILED',
              message: asString(turnError?.message) || 'Codex App Server 轮次执行失败',
            })
          }
          if (completedTurnId) options.emit({ type: 'forkAnchor', anchor: completedTurnId })
          options.emit({
            type: 'turnInfo', requestedModel: options.model ?? null, responseModel: options.model ?? null,
            viaGateway: false, baseUrl: null, transport: 'appServer',
          })
          options.emit({ type: 'result', usage: normalizeUsage(lastUsage), stopReason: status === 'completed' ? 'end_turn' : status })
          cleanup()
          resolveCompletion()
          break
        }
      }
    })
  })
  // 初始化请求可能先于 completion 的 await 失败；提前挂拒绝处理，避免进程级 unhandledRejection。
  void completion.catch(() => undefined)

  try {
    const init = await request('initialize', {
      clientInfo: { name: 'kai_toolbox', title: 'Kai Toolbox', version: '0.1.0' },
      capabilities: { experimentalApi: true },
    })
    void init
    send({ method: 'initialized', params: {} })
    initialized = true
    const threadResult = await request(threadId ? 'thread/resume' : 'thread/start', threadId
      ? { threadId, cwd: options.cwd, model: options.model ?? null, approvalPolicy: options.approvalPolicy, sandbox: options.sandbox, config: options.config ?? {} }
      : { cwd: options.cwd, model: options.model ?? null, approvalPolicy: options.approvalPolicy, sandbox: options.sandbox, config: options.config ?? {} })
    const thread = asRecord(threadResult.thread)
    threadId = asString(thread?.id) || threadId
    if (!threadId) throw new Error('Codex App Server 未返回 thread id')
    options.setThreadId(threadId)
    let runtimeMcpServers = options.mcpServers ?? []
    if (options.requiredMcpTools) {
      let runtimeStatuses: McpRuntimeStatus[]
      try {
        const statusResult = await request('mcpServerStatus/list', {
          threadId,
          detail: 'toolsAndAuthOnly',
          limit: 100,
        })
        runtimeStatuses = parseMcpRuntimeStatuses(statusResult)
      } catch (error) {
        throw new CodexAppServerTurnError(
          `业务咨询只读工具状态校验失败：${error instanceof Error ? error.message : String(error)}`,
          false,
        )
      }
      validateRequiredMcpTools(runtimeStatuses, options.requiredMcpTools)
      runtimeMcpServers = runtimeStatuses.map(status => ({
        name: status.name,
        status: status.tools.size > 0 ? 'connected' : 'unavailable',
      }))
    }
    options.emit({ type: 'init', sdkSessionId: threadId, mcpServers: runtimeMcpServers })
    // 请求一旦发出，服务端就可能已经开始调用工具；从这里起禁止 SDK 自动重放，避免双执行。
    turnAccepted = true
    const turnResult = await request('turn/start', {
      threadId,
      input: options.input,
      cwd: options.cwd,
      approvalPolicy: options.approvalPolicy,
      model: options.model ?? null,
      effort: options.reasoningEffort ?? null,
    })
    turnId = asString(asRecord(turnResult.turn)?.id)
    await completion
  } catch (error) {
    cleanup()
    failPending(error instanceof Error ? error : new Error(String(error)))
    if (error instanceof CodexAppServerTurnError) throw error
    throw new CodexAppServerTurnError(error instanceof Error ? error.message : String(error), !turnAccepted && !emittedActivity)
  }
}

function handleAppServerItem(
  phase: 'inProgress' | 'completed',
  item: Record<string, unknown> | undefined,
  emit: (event: Record<string, unknown>) => void,
  commandActivities: Map<string, CommandActivityState>,
): void {
  if (!item) return
  const itemType = asString(item.type)
  const itemId = asString(item.id)
  const status = asString(item.status) || phase
  switch (itemType) {
    case 'commandExecution': {
      const previous = commandActivities.get(itemId)
      const state: CommandActivityState = {
        command: asString(item.command) || previous?.command || '',
        cwd: asString(item.cwd) || previous?.cwd || '',
        output: tail(asString(item.aggregatedOutput) || previous?.output || '', MAX_COMMAND_OUTPUT_CHARS),
        startedAt: previous?.startedAt ?? Date.now(),
      }
      if (phase === 'inProgress') {
        commandActivities.set(itemId, state)
        emit({ type: 'toolUse', toolCallId: itemId, toolName: 'shell', input: { command: item.command, cwd: item.cwd } })
        emitCommandActivity(emit, itemId, 'inProgress', state)
      } else {
        emit({ type: 'toolResult', toolCallId: itemId, toolName: 'shell', output: state.output, isError: status === 'failed' })
        emitCommandActivity(emit, itemId, status, state)
        commandActivities.delete(itemId)
      }
      break
    }
    case 'fileChange': {
      const changes = Array.isArray(item.changes) ? item.changes : []
      emit({ type: 'codexActivity', activityType: 'file', itemId, status, title: phase === 'completed' ? '编辑了文件' : '正在编辑文件', data: changes })
      break
    }
    case 'mcpToolCall': {
      const label = `${asString(item.server)}/${asString(item.tool)}`
      const failed = status === 'failed'
      if (phase === 'inProgress') {
        emit({ type: 'toolUse', toolCallId: itemId, toolName: label, toolKind: 'mcp', input: item.arguments })
        emitToolActivity(emit, {
          toolCallId: itemId, toolName: label, status: 'inProgress', detail: summarizeToolInput(item.arguments),
        })
      } else {
        const output = safeJson(item.result ?? item.error)
        emit({ type: 'toolResult', toolCallId: itemId, toolName: label, toolKind: 'mcp', output, isError: failed })
        emitToolActivity(emit, {
          toolCallId: itemId, toolName: label, status: failed ? 'failed' : 'completed', outputTail: activityOutputTail(output),
        })
      }
      break
    }
    case 'dynamicToolCall': {
      const label = [asString(item.namespace), asString(item.tool)].filter(Boolean).join('/')
      const failed = item.success === false
      if (phase === 'inProgress') {
        emit({ type: 'toolUse', toolCallId: itemId, toolName: label, input: item.arguments })
        emitToolActivity(emit, {
          toolCallId: itemId, toolName: label, status: 'inProgress', detail: summarizeToolInput(item.arguments),
        })
      } else {
        const output = safeJson(item.contentItems)
        emit({ type: 'toolResult', toolCallId: itemId, toolName: label, output, isError: failed })
        emitToolActivity(emit, {
          toolCallId: itemId, toolName: label, status: failed ? 'failed' : 'completed', outputTail: activityOutputTail(output),
        })
      }
      break
    }
    case 'collabAgentToolCall':
      emit({
        type: 'codexActivity', activityType: 'agent', itemId, status,
        title: collabTitle(item), detail: asString(item.prompt),
        data: { receiverThreadIds: item.receiverThreadIds ?? [], agentsStates: item.agentsStates ?? {} },
      })
      break
    case 'subAgentActivity':
      emit({ type: 'codexActivity', activityType: 'agent', itemId, status, title: asString(item.kind) || '子智能体活动', detail: asString(item.agentPath), data: item })
      break
    case 'contextCompaction':
      emit({ type: 'codexActivity', activityType: 'context', itemId, status: 'completed', title: '上下文已自动压缩' })
      break
    case 'plan':
      emit({ type: 'codexActivity', activityType: 'plan', itemId, status, title: '执行计划', detail: asString(item.text) })
      break
    case 'reasoning': {
      const summary = Array.isArray(item.summary) ? item.summary.filter(v => typeof v === 'string').join('\n') : ''
      if (summary) emit({ type: 'codexActivity', activityType: 'reasoning', itemId, status, title: '推理摘要', detail: summary })
      break
    }
  }
}

function emitCommandActivity(
  emit: (event: Record<string, unknown>) => void,
  itemId: string,
  status: string,
  state: CommandActivityState,
): void {
  const normalizedStatus = status === 'failed' ? 'failed' : status === 'completed' ? 'completed' : 'inProgress'
  const result = normalizedStatus === 'inProgress'
    ? undefined
    : classifyCommandResult('shell', state.command, state.output, normalizedStatus === 'failed')
  emitToolActivity(emit, {
    toolCallId: itemId,
    toolName: 'shell',
    status: normalizedStatus,
    title: normalizedStatus === 'inProgress' ? '正在执行命令' : result?.title,
    detail: state.command,
    elapsedMs: elapsedSince(state.startedAt),
    outputTail: state.output || undefined,
    outcome: result?.outcome,
    severity: result?.severity,
  })
}

function tail(value: string, limit: number): string {
  return value.length > limit ? `…${value.slice(-(limit - 1))}` : value
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function notificationMessage(params: Record<string, unknown>): string {
  return asString(params.message) || asString(params.reason) || safeJson(params)
}

function normalizeUsage(usage: Record<string, unknown>): Record<string, number> {
  return {
    input_tokens: asNumber(usage.inputTokens),
    cached_input_tokens: asNumber(usage.cachedInputTokens),
    cache_write_input_tokens: asNumber(usage.cacheWriteInputTokens),
    output_tokens: asNumber(usage.outputTokens),
    reasoning_output_tokens: asNumber(usage.reasoningOutputTokens),
  }
}

function collabTitle(item: Record<string, unknown>): string {
  const tool = asString(item.tool)
  const count = Array.isArray(item.receiverThreadIds) ? item.receiverThreadIds.length : 0
  if (tool === 'spawnAgent') return count > 1 ? `已启动 ${count} 个子智能体` : '已启动子智能体'
  if (tool === 'wait') return '正在等待子智能体'
  return tool || '子智能体协作'
}

function safeJson(value: unknown): string {
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value) ?? ''
    return text.length > 8000 ? `${text.slice(0, 8000)}…` : text
  } catch {
    return String(value ?? '')
  }
}
