import { continueConsult, type StartSessionRequest } from './api'
import SHA256 from 'crypto-js/sha256'

const requestIds = new Map<string, string>()

/** 相同用户、来源和问题在刷新重试后仍使用同一目标ID；不把问答正文写入浏览器存储。 */
export async function requestConsultContinuation(userId: number | undefined, sourceId: string, request: StartSessionRequest,
  attachmentIdentity: string = '') {
  const hash = SHA256(JSON.stringify([request, attachmentIdentity])).toString()
  const key = `forge:consult-continuation:${userId}:${sourceId}:${hash}`
  let id = requestIds.get(key)
  try { id ||= sessionStorage.getItem(key) ?? undefined } catch { /* 无存储时保留页面内幂等。 */ }
  id ||= createRequestId()
  requestIds.set(key, id)
  try { sessionStorage.setItem(key, id) } catch { /* 无存储时保留页面内幂等。 */ }
  const session = await continueConsult(sourceId, id, request)
  requestIds.delete(key)
  try { sessionStorage.removeItem(key) } catch { /* 已成功创建；下一次明确新建使用新ID。 */ }
  return session
}

/** 局域网HTTP也可用；getRandomValues不要求安全上下文。 */
function createRequestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
