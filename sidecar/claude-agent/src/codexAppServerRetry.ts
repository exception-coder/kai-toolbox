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
  onRetry: (error: CodexAppServerTurnError) => void | Promise<void>,
): Promise<void> {
  try {
    await operation()
  } catch (error) {
    if (!isRetryableStartupFailure(error)) throw error
    await onRetry(error)
    await operation()
  }
}
