const AUTH_REFRESH_LOCK_NAME = 'kai-toolbox:auth-refresh'

export type AuthRefreshLockResult<T> =
  | { acquired: true; value: T }
  | { acquired: false }

/**
 * 串行执行同源窗口的 refresh token 轮换。
 * Chrome/Edge/PWA 使用 Web Locks 跨窗口协调；等待超时后返回未获取，避免隐藏窗口阻塞全部连接。
 * 不支持 Web Locks 时由调用方现有的进程内 Promise 去重，直接执行工作。
 */
export async function withAuthRefreshLock<T>(
  work: () => Promise<T>,
  waitTimeoutMs: number,
): Promise<AuthRefreshLockResult<T>> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    const controller = new AbortController()
    let acquired = false
    const timeoutId = window.setTimeout(() => controller.abort(), waitTimeoutMs)
    try {
      const value = await navigator.locks.request(
        AUTH_REFRESH_LOCK_NAME,
        { signal: controller.signal },
        async () => {
          acquired = true
          window.clearTimeout(timeoutId)
          return work()
        },
      )
      return { acquired: true, value }
    } catch (error) {
      if (!acquired && controller.signal.aborted) return { acquired: false }
      throw error
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  return { acquired: true, value: await work() }
}
