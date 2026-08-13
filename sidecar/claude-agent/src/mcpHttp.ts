const DEFAULT_MCP_HTTP_TIMEOUT_MS = 30_000
const MIN_MCP_HTTP_TIMEOUT_MS = 1_000
const MAX_MCP_HTTP_TIMEOUT_MS = 10 * 60_000

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

export function configuredMcpHttpTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.TOOLBOX_MCP_HTTP_TIMEOUT_MS?.trim()
  const configured = raw ? Number(raw) : Number.NaN
  if (!Number.isFinite(configured)) return DEFAULT_MCP_HTTP_TIMEOUT_MS
  return Math.min(MAX_MCP_HTTP_TIMEOUT_MS, Math.max(MIN_MCP_HTTP_TIMEOUT_MS, Math.trunc(configured)))
}
