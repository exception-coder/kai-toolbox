import { CodexAppServerTurnError } from './codexAppServer.js'

const MCP_INITIALIZATION_FAILURE = /required MCP servers failed to initialize|handshaking with MCP server failed|failed to initialize session[^\n]*MCP|initialize response|MCP[^\n]*(?:initialize|初始化)[^\n]*(?:failed|失败)/i
const NON_TRANSIENT_INITIALIZATION_FAILURE = /not found|cannot find (?:module|package)|ERR_MODULE_NOT_FOUND|ENOENT|SyntaxError|ERR_UNKNOWN_FILE_EXTENSION|不存在|unauthorized|forbidden|permission denied|protocol version|配置无效/i
const THREAD_WRITER_CONFLICT = /already has an active writer|thread-store conflict:[^\n]*\bactive writer\b/i

/** Classify without echoing raw errors, paths, headers or credentials into the transcript. */
export function mcpInitializationFailureReason(message: string): 'configuration' | 'timeout' | 'closed' | 'unknown' {
  if (NON_TRANSIENT_INITIALIZATION_FAILURE.test(message)) return 'configuration'
  if (/timed?\s*out|timeout|deadline.*elapsed|超时/i.test(message)) return 'timeout'
  if (/connection closed|channel closed|broken pipe|\bEOF\b|连接.*关闭/i.test(message)) return 'closed'
  return 'unknown'
}

export function mcpInitializationRetryMessage(message: string): string {
  const reason = mcpInitializationFailureReason(message)
  const detail = reason === 'timeout' ? 'MCP 初始化握手超时'
    : reason === 'closed' ? 'MCP 初始化连接关闭' : 'MCP 初始化失败'
  return `Codex App Server ${detail}，已确认旧进程退出，正在重试（1/1）；尚未发送开发任务。`
}

export function isRetryableMcpInitializationFailure(error: unknown): error is CodexAppServerTurnError {
  return error instanceof CodexAppServerTurnError
    && error.retrySafe
    && MCP_INITIALIZATION_FAILURE.test(error.message)
    && !NON_TRANSIENT_INITIALIZATION_FAILURE.test(error.message)
}

export function isPermanentMcpInitializationFailure(error: unknown): boolean {
  return error instanceof CodexAppServerTurnError && MCP_INITIALIZATION_FAILURE.test(error.message)
    && NON_TRANSIENT_INITIALIZATION_FAILURE.test(error.message)
}

export function isRetryableThreadWriterConflict(error: unknown): error is CodexAppServerTurnError {
  return isThreadWriterConflict(error) && error.retrySafe
}

function isThreadWriterConflict(error: unknown): error is CodexAppServerTurnError {
  return error instanceof CodexAppServerTurnError && THREAD_WRITER_CONFLICT.test(error.message)
}

/** Even an unsafe-to-replay conflict must keep the pending-message queue paused. */
export function emitCodexThreadWriterConflict(
  error: unknown,
  emit: (event: Record<string, unknown>) => void,
): boolean {
  if (!isThreadWriterConflict(error)) return false
  emit({
    type: 'error',
    code: 'CODEX_THREAD_WRITER_BUSY',
    message: 'Codex 原生会话被占用，请先在对应的 VS Code、Codex 桌面或 Forge 语音连接中释放该会话，再重试当前消息。仅停止生成可能不会立即释放连接；待发送队列已暂停，避免重复执行。',
  })
  emit({ type: 'result', usage: {}, stopReason: 'error', queueReleaseSafe: false })
  return true
}

function isRetryableStartupFailure(error: unknown): error is CodexAppServerTurnError {
  return isRetryableMcpInitializationFailure(error) || isRetryableThreadWriterConflict(error)
}

export async function runCodexAppServerWithStartupRetry(
  operation: () => Promise<void>,
  onRetry: (error: CodexAppServerTurnError, attempt: number) => void | Promise<void>,
  options: { maxWriterRetries?: number; signal?: AbortSignal } = {},
): Promise<void> {
  let writerRetries = 0
  let mcpRetried = false
  while (true) {
    if (options.signal?.aborted) throw options.signal.reason ?? new Error('Codex turn aborted')
    try {
      await operation()
      return
    } catch (error) {
      if (!isRetryableStartupFailure(error) || options.signal?.aborted) throw error
      if (isRetryableThreadWriterConflict(error)) {
        if (writerRetries >= (options.maxWriterRetries ?? 1)) throw error
        writerRetries += 1
        await onRetry(error, writerRetries)
      } else {
        if (mcpRetried) throw error
        mcpRetried = true
        await onRetry(error, 1)
      }
    }
  }
}
