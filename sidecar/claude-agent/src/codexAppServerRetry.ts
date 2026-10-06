import { CodexAppServerTurnError } from './codexAppServer.js'

const MCP_INITIALIZATION_FAILURE = /required MCP servers failed to initialize|handshaking with MCP server failed|failed to initialize session[^\n]*MCP|initialize response|MCP[^\n]*(?:initialize|初始化)[^\n]*(?:failed|失败)/i
const NON_TRANSIENT_INITIALIZATION_FAILURE = /not found|不存在|unauthorized|forbidden|permission denied|protocol version|配置无效/i
const THREAD_WRITER_CONFLICT = /thread-store conflict|already has an active writer/i

export function isRetryableMcpInitializationFailure(error: unknown): error is CodexAppServerTurnError {
  return error instanceof CodexAppServerTurnError
    && error.retrySafe
    && MCP_INITIALIZATION_FAILURE.test(error.message)
    && !NON_TRANSIENT_INITIALIZATION_FAILURE.test(error.message)
}

export function isRetryableThreadWriterConflict(error: unknown): error is CodexAppServerTurnError {
  return error instanceof CodexAppServerTurnError
    && error.retrySafe
    && THREAD_WRITER_CONFLICT.test(error.message)
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
