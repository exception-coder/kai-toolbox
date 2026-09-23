import {
  isAbortError,
  isSDKAssistantMessage,
  isSDKPartialAssistantMessage,
  isSDKResultMessage,
  isSDKSystemMessage,
  isSDKUserMessage,
  query,
  type CanUseTool,
  type ContentBlock,
  type PermissionMode,
  type SDKMessage,
} from '@qwen-code/sdk'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { activityOutputTail, emitToolActivity, summarizeToolInput } from './toolActivity.js'

export interface QwenTurnContext {
  text: string
  cwd: string
  model?: string
  sdkSessionId?: string
  permissionMode: string
  toolPolicy?: string
  developerInstructions?: string
  signal: AbortSignal
  emit: (event: Record<string, unknown>) => void
  setSdkSessionId: (id?: string) => void
  canUseTool?: (toolName: string, input: Record<string, unknown>, options: { signal?: AbortSignal }) => Promise<Record<string, unknown>>
}

export interface QwenQueryLike extends AsyncIterable<SDKMessage> {
  close(): Promise<void>
  getAvailableModels?(): Promise<Record<string, unknown> | null>
}

type QwenQueryFactory = (args: Parameters<typeof query>[0]) => QwenQueryLike

export function mapQwenPermissionMode(mode: string, toolPolicy?: string): PermissionMode {
  if (toolPolicy === 'disabled' || toolPolicy === 'review-only' || toolPolicy === 'consult-readonly' || mode === 'plan') return 'plan'
  if (mode === 'bypassPermissions') return 'yolo'
  if (mode === 'acceptEdits') return 'auto-edit'
  return 'default'
}

export function createQwenPermissionHandler(ctx: QwenTurnContext): CanUseTool | undefined {
  if (!ctx.canUseTool) return undefined
  return async (toolName, input, options) => {
    const decision = await ctx.canUseTool!(toolName, input, { signal: options.signal })
    if (decision.behavior === 'allow') {
      const updatedInput = decision.updatedInput
      return { behavior: 'allow', updatedInput: isRecord(updatedInput) ? updatedInput : input }
    }
    return {
      behavior: 'deny',
      message: typeof decision.message === 'string' ? decision.message : 'Forge denied this tool action.',
      interrupt: decision.interrupt === true,
    }
  }
}

export async function runQwenTurn(ctx: QwenTurnContext, queryFactory: QwenQueryFactory = query): Promise<void> {
  const controller = new AbortController()
  const onAbort = () => controller.abort(ctx.signal.reason)
  if (ctx.signal.aborted) onAbort()
  else ctx.signal.addEventListener('abort', onAbort, { once: true })

  let q: QwenQueryLike | undefined
  const streamedText = new Map<number, string>()
  const startedTools = new Map<string, string>()
  try {
    q = queryFactory({
      prompt: ctx.text,
      options: {
        cwd: ctx.cwd,
        model: ctx.model || undefined,
        resume: ctx.sdkSessionId || undefined,
        abortController: controller,
        permissionMode: mapQwenPermissionMode(ctx.permissionMode, ctx.toolPolicy),
        canUseTool: createQwenPermissionHandler(ctx),
        systemPrompt: ctx.developerInstructions
          ? { type: 'preset', preset: 'qwen_code', append: ctx.developerInstructions }
          : undefined,
        stderr: message => process.stderr.write(`[qwen-code] ${message}`),
      },
    })

    for await (const message of q) {
      if (message.session_id) {
        ctx.setSdkSessionId(message.session_id)
      }
      translateQwenMessage(message, ctx.emit, streamedText, startedTools)
    }
  } catch (error) {
    if (ctx.signal.aborted || isAbortError(error)) {
      ctx.emit({ type: 'result', usage: {}, stopReason: 'interrupted' })
      return
    }
    ctx.emit({
      type: 'error',
      code: /CLI process exited with code 1/i.test(error instanceof Error ? error.message : String(error)) && qwenAuthMissing(ctx.cwd)
        ? 'QWEN_AUTH_REQUIRED' : 'QWEN_QUERY_FAILED',
      message: qwenRecoveryMessage(error, ctx.cwd),
    })
    ctx.emit({ type: 'result', usage: {}, stopReason: 'error' })
  } finally {
    ctx.signal.removeEventListener('abort', onAbort)
    await q?.close().catch(() => undefined)
  }
}

/** Query the current Qwen Code provider without sending a user turn. */
export async function listQwenModels(cwd: string, queryFactory: QwenQueryFactory = query) {
  if (qwenAuthMissing(cwd)) throw new Error(qwenRecoveryMessage(new Error('QWEN_AUTH_REQUIRED'), cwd))
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('Qwen 模型目录检测超时')), 15_000)
  timeout.unref?.()
  let q: QwenQueryLike | undefined
  try {
    // Keep stdin open until the control request completes; an empty iterator may end the CLI before it replies.
    const prompt = (async function* () {
      await new Promise<void>(resolve => controller.signal.addEventListener('abort', () => resolve(), { once: true }))
    })()
    q = queryFactory({ prompt, options: { cwd, abortController: controller } })
    const response = await q.getAvailableModels?.()
    const raw = response?.models
    if (!Array.isArray(raw)) throw new Error('Qwen Code 未返回模型目录')
    return raw.flatMap((item: unknown) => {
      if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim()) return []
      return [{ value: item.id, displayName: typeof item.label === 'string' ? item.label : item.id,
        description: typeof item.contextWindowSize === 'number' ? `上下文 ${item.contextWindowSize.toLocaleString()} tokens` : '' }]
    })
  } catch (error) {
    throw new Error(qwenRecoveryMessage(error, cwd))
  } finally {
    clearTimeout(timeout)
    controller.abort()
    await q?.close().catch(() => undefined)
  }
}

export function translateQwenMessage(message: SDKMessage, emit: QwenTurnContext['emit'],
                                     streamedText = new Map<number, string>(),
                                     startedTools = new Map<string, string>()): void {
  if (isSDKSystemMessage(message)) {
    if (message.subtype === 'init') {
      emit({
        type: 'init',
        sdkSessionId: message.session_id,
        mcpServers: message.mcp_servers ?? [],
      })
    }
    return
  }
  if (isSDKPartialAssistantMessage(message)) {
    const event = message.event
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      streamedText.set(event.index, (streamedText.get(event.index) ?? '') + event.delta.text)
      emit({ type: 'assistantDelta', text: event.delta.text })
    }
    return
  }
  if (isSDKAssistantMessage(message)) {
    message.message.content.forEach((block, index) => translateAssistantBlock(block, index, emit, streamedText, startedTools))
    emit({
      type: 'turnInfo',
      requestedModel: message.message.model ?? null,
      responseModel: message.message.model ?? null,
      viaGateway: false,
      baseUrl: null,
      transport: 'qwenSdk',
    })
    return
  }
  if (isSDKUserMessage(message)) {
    const content = message.message.content
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type !== 'tool_result') continue
        emit({
          type: 'toolResult',
          toolCallId: block.tool_use_id,
          toolName: startedTools.get(block.tool_use_id) ?? 'qwen-tool',
          output: stringifyContent(block.content),
          isError: block.is_error === true,
        })
        emitToolActivity(emit, {
          toolCallId: block.tool_use_id,
          toolName: startedTools.get(block.tool_use_id) ?? 'qwen-tool',
          status: block.is_error ? 'failed' : 'completed',
          outputTail: activityOutputTail(block.content),
        })
      }
    }
    return
  }
  if (isSDKResultMessage(message)) {
    if (message.is_error) {
      emit({ type: 'error', code: 'QWEN_TURN_FAILED', message: message.error?.message ?? message.subtype })
    }
    emit({ type: 'result', usage: message.usage ?? {}, stopReason: message.is_error ? 'error' : 'end_turn' })
  }
}

function translateAssistantBlock(block: ContentBlock, index: number, emit: QwenTurnContext['emit'],
                                 streamedText: Map<number, string>, startedTools: Map<string, string>): void {
  if (block.type === 'text') {
    const alreadySent = streamedText.get(index) ?? ''
    if (block.text.length > alreadySent.length) emit({ type: 'assistantDelta', text: block.text.slice(alreadySent.length) })
    return
  }
  if (block.type !== 'tool_use' || startedTools.has(block.id)) return
  startedTools.set(block.id, block.name)
  const input = isRecord(block.input) ? block.input : {}
  emit({ type: 'toolUse', toolCallId: block.id, toolName: block.name, input })
  emitToolActivity(emit, {
    toolCallId: block.id,
    toolName: block.name,
    status: 'inProgress',
    detail: summarizeToolInput(input),
  })
}

function qwenRecoveryMessage(error: unknown, cwd: string): string {
  const detail = error instanceof Error ? error.message : String(error)
  if (/CLI process exited with code 1|QWEN_AUTH_REQUIRED/i.test(detail) && qwenAuthMissing(cwd)) {
    return 'Qwen Code 尚未选择认证方式。请在运行 Forge 的同一 Windows 账户下打开 Qwen Code CLI，使用 /auth 配置模型服务；千问办公登录不会自动授权 Qwen Code。配置后点击「重新同步模型」再重试。'
  }
  if (/auth|login|credential|api.?key|unauthorized/i.test(detail)) {
    return `Qwen Code 认证不可用：${detail}。请先在运行 Sidecar 的账户下完成 qwen 登录或配置模型服务凭据。`
  }
  return `Qwen Code 执行失败：${detail}。请检查 Qwen Code 配置、模型服务和当前工作目录后重试。`
}

function qwenAuthMissing(cwd: string): boolean {
  if (['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'].some(name => process.env[name])) return false
  const home = process.env.QWEN_HOME || path.join(os.homedir(), '.qwen')
  for (const file of [path.join(home, 'settings.json'), path.join(cwd, '.qwen', 'settings.json')]) {
    try {
      const settings = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
      const security = isRecord(settings.security) ? settings.security : {}
      const auth = isRecord(security.auth) ? security.auth : {}
      if (typeof auth.selectedType === 'string' && auth.selectedType.trim()) return false
    } catch { /* Missing or malformed settings cannot establish an auth selection. */ }
  }
  return true
}

function stringifyContent(value: unknown): string {
  if (typeof value === 'string') return value
  try { return JSON.stringify(value ?? '') } catch { return String(value ?? '') }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}
