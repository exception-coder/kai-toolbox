const DEFAULT_MCP_HTTP_TIMEOUT_MS = 30_000
const MIN_MCP_HTTP_TIMEOUT_MS = 1_000
const MAX_MCP_HTTP_TIMEOUT_MS = 10 * 60_000
const MCP_PROGRESS_HEARTBEAT_MS = 5_000

export interface McpRequestExtra {
  signal?: AbortSignal
  _meta?: { progressToken?: string | number }
  sendNotification?: (notification: {
    method: 'notifications/progress'
    params: { progressToken: string | number; progress: number; total?: number; message?: string }
  }) => Promise<void>
}

export interface McpHttpTextResult {
  response: Response
  text: string
  elapsedMs: number
}

/** Adds a real transport deadline to HTTP-backed MCP tools so fetch cannot remain pending forever. */
export async function fetchMcpHttp(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const timeoutMs = configuredMcpHttpTimeoutMs()
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal
  try {
    return await fetch(input, { ...init, signal })
  } catch (error) {
    if (timeoutSignal.aborted) {
      throw new Error(`MCP HTTP 请求超时（${timeoutMs}ms）`, { cause: error })
    }
    throw error
  }
}

/** Executes one HTTP-backed MCP operation with standard progress and end-to-end cancellation. */
export async function fetchMcpHttpText(
  input: string | URL,
  init: RequestInit,
  extra: McpRequestExtra | undefined,
  operation: string,
): Promise<McpHttpTextResult> {
  const startedAt = Date.now()
  await reportMcpProgress(extra, 1, 4, `${operation}：正在连接 Forge 后端`)
  const heartbeat = setInterval(() => {
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1_000))
    void reportMcpProgress(extra, 2, 4, `${operation}：后端处理中，已等待 ${elapsedSeconds} 秒`)
  }, MCP_PROGRESS_HEARTBEAT_MS)
  heartbeat.unref?.()
  try {
    const response = await fetchMcpHttp(input, { ...init, signal: extra?.signal })
    await reportMcpProgress(extra, 3, 4, `${operation}：已收到响应，正在读取结果`)
    const text = await response.text()
    await reportMcpProgress(extra, 4, 4,
      `${operation}：${response.ok ? '处理完成' : `处理失败（HTTP ${response.status}）`}`)
    return { response, text, elapsedMs: Date.now() - startedAt }
  } catch (error) {
    const cancelled = extra?.signal?.aborted
    const reason = error instanceof Error ? error.message : String(error)
    await reportMcpProgress(extra, 4, 4,
      `${operation}：${cancelled ? '已取消' : '异常结束'}（${compactMessage(reason)}）`)
    throw error
  } finally {
    clearInterval(heartbeat)
  }
}

function compactMessage(message: string): string {
  const normalized = message.replace(/\s+/g, ' ').trim()
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized
}

export function configuredMcpHttpTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.TOOLBOX_MCP_HTTP_TIMEOUT_MS?.trim()
  const configured = raw ? Number(raw) : Number.NaN
  if (!Number.isFinite(configured)) return DEFAULT_MCP_HTTP_TIMEOUT_MS
  return Math.min(MAX_MCP_HTTP_TIMEOUT_MS, Math.max(MIN_MCP_HTTP_TIMEOUT_MS, Math.trunc(configured)))
}

export async function reportMcpProgress(
  extra: McpRequestExtra | undefined,
  progress: number,
  total: number,
  message: string,
): Promise<void> {
  const progressToken = extra?._meta?.progressToken
  if (progressToken == null || !extra?.sendNotification) return
  try {
    const notification = extra.sendNotification({
      method: 'notifications/progress',
      params: { progressToken, progress, total, message: `步骤 ${progress}/${total} · ${message}` },
    })
    void notification.catch(() => undefined)
  } catch {
    // 进度是可选旁路，不能因客户端不支持而让业务工具失败。
  }
}
