import { CopilotClient, type SessionConfig, type SessionEvent } from '@github/copilot-sdk'
import { safeEngineError, type EmbeddedEngineContext } from './engine/embeddedEngineContext.js'
import { activityOutputTail, emitToolActivity, summarizeToolInput } from './toolActivity.js'

const TURN_TIMEOUT_MS = 15 * 60_000

export function copilotPermissionInput(name: string, input: Record<string, unknown>) {
  const names: Record<string, string> = { view: 'Read', grep: 'Grep', glob: 'Glob',
    bash: 'Bash', powershell: 'Bash', edit: 'Edit', create: 'Write' }
  const mapped = names[name]
  return mapped ? { name: mapped, input: { ...input,
    ...(typeof input.path === 'string' ? { file_path: input.path } : {}) } } : undefined
}

export function copilotSessionConfig(ctx: EmbeddedEngineContext, onLimit: () => void = () => undefined): SessionConfig {
  if (ctx.apiBaseUrl && (!ctx.authToken || !ctx.model)) throw new Error('Copilot 第三方服务需要 API Key 和明确的模型 ID。')
  let calls = 0
  return {
    model: ctx.model || undefined, workingDirectory: ctx.cwd, streaming: true,
    enableConfigDiscovery: false,
    ...(ctx.apiBaseUrl ? { provider: { type: 'openai', wireApi: 'completions', baseUrl: ctx.apiBaseUrl, apiKey: ctx.authToken } } : {}),
    systemMessage: ctx.developerInstructions ? { mode: 'append', content: ctx.developerInstructions } : undefined,
    hooks: { onPreToolUse: async input => {
      if (++calls > 100 || ctx.signal.aborted) {
        onLimit()
        return { permissionDecision: 'deny', permissionDecisionReason: 'Forge 工具调用上限或会话已中断' }
      }
      const args = input.toolArgs && typeof input.toolArgs === 'object' ? input.toolArgs as Record<string, unknown> : {}
      const mapped = copilotPermissionInput(input.toolName, args)
      if (!mapped) return { permissionDecision: 'deny', permissionDecisionReason: 'Forge 尚未适配此工具权限' }
      const decision = await ctx.canUseTool(mapped.name, mapped.input, { signal: ctx.signal })
      if (decision.updatedInput && JSON.stringify(decision.updatedInput) !== JSON.stringify(mapped.input)) {
        return { permissionDecision: 'deny', permissionDecisionReason: '请使用修改后的参数重新发起工具调用' }
      }
      return { permissionDecision: decision.behavior === 'allow' ? 'allow' : 'deny',
        permissionDecisionReason: String(decision.message ?? 'Forge 会话权限策略') }
    } },
    onPermissionRequest: async request => {
      const decision = await ctx.canUseTool(`Copilot:${request.kind}`, { ...request }, { signal: ctx.signal })
      return decision.behavior === 'allow' ? { kind: 'approve-once' } : { kind: 'reject', feedback: String(decision.message ?? 'Forge 拒绝此操作') }
    },
  }
}

export async function listCopilotModels() {
  const client = new CopilotClient()
  try {
    await client.start()
    return (await client.listModels()).map(model => ({ value: model.id, displayName: model.name, description: '' }))
  } finally { await client.stop() }
}

export async function runCopilotTurn(ctx: EmbeddedEngineContext): Promise<void> {
  const client = new CopilotClient({ workingDirectory: ctx.cwd, ...(ctx.apiBaseUrl ? { useLoggedInUser: false } : {}) })
  let session: Awaited<ReturnType<CopilotClient['createSession']>> | undefined
  let unsubscribe: (() => void) | undefined
  let failure: string | undefined
  let output = false
  const tools = new Map<string, string>()
  const onAbort = () => { void session?.abort().catch(() => undefined) }
  try {
    ctx.signal.throwIfAborted()
    const config = copilotSessionConfig(ctx, () => { failure = 'Forge 工具调用达到上限'; onAbort() })
    await client.start()
    session = ctx.sdkSessionId ? await client.resumeSession(ctx.sdkSessionId, config) : await client.createSession(config)
    ctx.setSdkSessionId(session.sessionId)
    unsubscribe = session.on((event: SessionEvent) => {
      if (event.type === 'assistant.message_delta') {
        output = true
        ctx.emit({ type: 'assistantDelta', text: event.data.deltaContent })
      }
      if (event.type === 'session.error') failure = event.data.message
      if (event.type === 'tool.execution_start') {
        tools.set(event.data.toolCallId, event.data.toolName)
        emitToolActivity(ctx.emit, { toolCallId: event.data.toolCallId, toolName: event.data.toolName, status: 'inProgress', detail: summarizeToolInput(event.data.arguments) })
      }
      if (event.type === 'tool.execution_complete') emitToolActivity(ctx.emit, { toolCallId: event.data.toolCallId, toolName: tools.get(event.data.toolCallId) ?? 'tool', status: event.data.success ? 'completed' : 'failed', outputTail: activityOutputTail(event.data.result ?? event.data.error) })
    })
    ctx.signal.addEventListener('abort', onAbort, { once: true })
    ctx.signal.throwIfAborted()
    const response = await session.sendAndWait({ prompt: ctx.text }, TURN_TIMEOUT_MS)
    if (failure) throw new Error(failure)
    if (!output && response?.data.content) { ctx.emit({ type: 'assistantDelta', text: response.data.content }); output = true }
    if (!output && !ctx.signal.aborted) throw new Error('Copilot 本轮没有返回回复。请检查账号或第三方模型配置。')
    ctx.emit({ type: 'result', usage: {}, stopReason: ctx.signal.aborted ? 'interrupted' : 'end_turn' })
  } catch (error) {
    await session?.abort().catch(() => undefined)
    if (!ctx.signal.aborted) ctx.emit({ type: 'error', code: 'COPILOT_QUERY_FAILED', message: safeEngineError(error, ctx.authToken) })
    ctx.emit({ type: 'result', usage: {}, stopReason: ctx.signal.aborted ? 'interrupted' : 'error' })
  } finally {
    ctx.signal.removeEventListener('abort', onAbort)
    unsubscribe?.()
    try { await session?.disconnect() } finally { await client.stop() }
  }
}
