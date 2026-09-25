import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent'
import { activityOutputTail, emitToolActivity, summarizeToolInput } from './toolActivity.js'
import { safeEngineError, type EmbeddedEngineContext } from './engine/embeddedEngineContext.js'

const AGENT_DIR = join(homedir(), '.pi', 'agent')
const MAX_TOOL_CALLS = 100

export function piPermissionInput(name: string, input: Record<string, unknown>) {
  const names: Record<string, string> = { read: 'Read', edit: 'Edit', write: 'Write', bash: 'Bash', powershell: 'Bash', grep: 'Grep', find: 'Glob', ls: 'Read' }
  return { name: names[name] ?? name, input: { ...input, ...(typeof input.path === 'string' ? { file_path: input.path } : {}) } }
}

async function piModels(ctx: Pick<EmbeddedEngineContext, 'apiBaseUrl' | 'authToken' | 'model'>) {
  const runtime = await ModelRuntime.create({ authPath: join(AGENT_DIR, 'auth.json'), modelsPath: ctx.apiBaseUrl ? null : join(AGENT_DIR, 'models.json') })
  if (ctx.apiBaseUrl) {
    if (!ctx.authToken || !ctx.model) throw new Error('Pi 第三方服务需要 API Key 和明确的模型 ID。')
    runtime.registerProvider('forge', { baseUrl: ctx.apiBaseUrl, api: 'openai-completions',
      models: [{ id: ctx.model, name: ctx.model, reasoning: false, input: ['text'],
        contextWindow: 32768, maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] })
    await runtime.setRuntimeApiKey('forge', ctx.authToken)
  }
  return runtime
}

export async function listPiModels() {
  const runtime = await piModels({})
  return (await runtime.getAvailable()).map(model => ({ value: `${model.provider}/${model.id}`, displayName: `${model.name} · ${model.provider}`, description: '' }))
}

export async function runPiTurn(ctx: EmbeddedEngineContext): Promise<void> {
  let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined
  let unsubscribe: (() => void) | undefined
  const onAbort = () => { void session?.abort() }
  let failure: string | undefined
  let calls = 0
  let output = false
  try {
    ctx.signal.throwIfAborted()
    const runtime = await piModels(ctx)
    const available = await runtime.getAvailable()
    const model = ctx.apiBaseUrl ? runtime.getModel('forge', ctx.model!)
      : ctx.model ? available.find(m => `${m.provider}/${m.id}` === ctx.model) : available[0]
    if (!model) throw new Error('Pi 没有可用模型。请在运行 Forge 的账户下运行 pi，通过 /login 配置认证后同步模型。')
    if (ctx.sdkSessionId && !existsSync(ctx.sdkSessionId)) throw new Error('Pi 原生会话文件不存在，无法安全恢复。请新建会话。')
    const settingsManager = SettingsManager.inMemory({ retry: { enabled: false } })
    const loader = new DefaultResourceLoader({ cwd: ctx.cwd, agentDir: AGENT_DIR, settingsManager,
      noExtensions: true, noPromptTemplates: true, noThemes: true,
      appendSystemPrompt: ctx.developerInstructions ? [ctx.developerInstructions] : [],
      extensionFactories: [pi => {
        pi.on('tool_call', async event => {
          if (++calls > MAX_TOOL_CALLS || ctx.signal.aborted) {
            failure = 'Forge 工具调用上限或会话已中断'
            queueMicrotask(onAbort)
            return { block: true, reason: failure }
          }
          const mapped = piPermissionInput(event.toolName, event.input)
          const decision = await ctx.canUseTool(mapped.name, mapped.input, { signal: ctx.signal })
          if (decision.behavior !== 'allow') return { block: true, reason: String(decision.message ?? 'Forge 拒绝此工具操作') }
          if (decision.updatedInput && JSON.stringify(decision.updatedInput) !== JSON.stringify(mapped.input)) {
            return { block: true, reason: '请使用修改后的参数重新发起工具调用' }
          }
        })
      }] })
    await loader.reload()
    const manager = ctx.sdkSessionId ? SessionManager.open(ctx.sdkSessionId, undefined, ctx.cwd) : SessionManager.create(ctx.cwd)
    ;({ session } = await createAgentSession({ cwd: ctx.cwd, modelRuntime: runtime, model,
      settingsManager, resourceLoader: loader, sessionManager: manager }))
    const handle = manager.getSessionFile()
    if (handle) ctx.setSdkSessionId(handle)
    unsubscribe = session.subscribe(event => {
      if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
        output = true
        ctx.emit({ type: 'assistantDelta', text: event.assistantMessageEvent.delta })
      }
      if (event.type === 'message_end' && event.message.role === 'assistant') {
        if (event.message.stopReason === 'error') failure = event.message.errorMessage ?? 'Pi 模型执行失败'
      }
      if (event.type === 'tool_execution_start') emitToolActivity(ctx.emit, { toolCallId: event.toolCallId, toolName: event.toolName, status: 'inProgress', detail: summarizeToolInput(event.args) })
      if (event.type === 'tool_execution_end') emitToolActivity(ctx.emit, { toolCallId: event.toolCallId, toolName: event.toolName, status: event.isError ? 'failed' : 'completed', outputTail: activityOutputTail(event.result) })
    })
    ctx.signal.addEventListener('abort', onAbort, { once: true })
    ctx.signal.throwIfAborted()
    await session.prompt(ctx.text)
    if (failure) throw new Error(failure)
    if (!output && !ctx.signal.aborted) throw new Error('Pi 本轮没有返回可显示的回复。请检查模型配置。')
    ctx.emit({ type: 'result', usage: {}, stopReason: ctx.signal.aborted ? 'interrupted' : 'end_turn' })
  } catch (error) {
    if (!ctx.signal.aborted) ctx.emit({ type: 'error', code: 'PI_QUERY_FAILED', message: safeEngineError(error, ctx.authToken) })
    ctx.emit({ type: 'result', usage: {}, stopReason: ctx.signal.aborted ? 'interrupted' : 'error' })
  } finally {
    ctx.signal.removeEventListener('abort', onAbort)
    unsubscribe?.()
    session?.dispose()
  }
}
