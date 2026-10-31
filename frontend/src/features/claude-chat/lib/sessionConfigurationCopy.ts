import { ApiError } from '@/lib/api'
import { requestSessionCopy, type SessionCopyResult } from '../api'

const pendingKey = (sourceId: string) => `kai-toolbox:pending-session-copy:${sourceId}`
function forget(key: string) {
  try { localStorage.removeItem(key) } catch { /* 已确认的数据库回执不因浏览器存储清理失败而变成未知。 */ }
}

/** 只有当前操作实际展示了结果才结束意图；离页后的迟到回执留给下次核对。 */
export function acknowledgeSessionCopy(result: SessionCopyResult) {
  const key = pendingKey(result.sourceSessionId)
  try {
    if (localStorage.getItem(key) === result.requestId) forget(key)
  } catch { /* 保留原编号可安全取回同一副本。 */ }
}

/** 明确拒绝可直接展示；网络错误及服务端异常不能证明事务未提交。 */
export function isCopyRejected(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500
    && error.status !== 408 && error.status !== 429
}

/** 持久编号先于写请求；刷新或重试继续核对原请求，不猜测标题与列表顺序。 */
export async function copySessionConfiguration(sourceId: string): Promise<SessionCopyResult> {
  const key = pendingKey(sourceId)
  let requestId: string
  try {
    requestId = localStorage.getItem(key) || crypto.randomUUID()
    localStorage.setItem(key, requestId)
  } catch {
    throw new ApiError(400, null, '无法保存复制请求编号，请允许本站存储后重试。尚未发送复制请求。')
  }
  let failure: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10_000)
    try {
      const result = await requestSessionCopy(sourceId, requestId, controller.signal)
      if (result.requestId !== requestId || result.sourceSessionId !== sourceId || !result.targetSessionId) {
        throw new Error('复制回执不匹配，未切换会话')
      }
      return result
    } catch (error) {
      if (isCopyRejected(error)) {
        // 旧运行版 404、授权变化等均保留原意图；已删除副本明确告知后允许用户另建。
        if (error instanceof ApiError && error.status === 410) forget(key)
        if (error instanceof ApiError && error.status === 404) {
          throw new ApiError(404, error.payload, '当前运行版本尚不支持可靠复制，请加载新版后重试。原请求编号已保留。')
        }
        throw error
      }
      failure = error
    } finally {
      window.clearTimeout(timeout)
    }
  }
  throw failure
}
