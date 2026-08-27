import { useSyncExternalStore } from 'react'
import { withAuthRefreshLock } from './authRefreshCoordinator'

// 与 lib/api.ts 中读取的 key 保持一致（api.ts 为避免循环依赖直接读字符串字面量）
const TOKEN_KEY = 'toolbox.auth.token'
const REFRESH_KEY = 'toolbox.auth.refresh'
const EXPIRES_KEY = 'toolbox.auth.expiresAt'
const USER_KEY = 'toolbox.auth.user'
const PERMS_KEY = 'toolbox.auth.perms'
const SUPERADMIN_KEY = 'toolbox.auth.superAdmin'
const AUTH_STORAGE_KEYS = new Set([
  TOKEN_KEY,
  REFRESH_KEY,
  EXPIRES_KEY,
  USER_KEY,
  PERMS_KEY,
  SUPERADMIN_KEY,
])

const API = '/api'
/** access token 过期前多久就提前刷新（毫秒）。 */
const REFRESH_MARGIN_MS = 30_000
const REFRESH_REQUEST_TIMEOUT_MS = 5_000
// 等待时间要覆盖持锁窗口的请求超时与清理，否则正常的慢刷新尚未结束，跟随窗口就会误拿旧 token 建连。
const REFRESH_LOCK_WAIT_MS = REFRESH_REQUEST_TIMEOUT_MS + 2_000

export interface AuthUser {
  userId: number
  username: string
  roles: string[]
}

interface LoginResponse {
  accessToken: string
  refreshToken: string
  tokenType: string
  expiresIn: number
  user: AuthUser
  /** Forge 权限体系：登录快照下发的权限码集合与超管标记（后端 forge 关闭时可能缺省）。 */
  permissionCodes?: string[]
  superAdmin?: boolean
}

const listeners = new Set<() => void>()

// 「会话非自愿失效」订阅者：仅在 refresh 失败 / HTTP 401 / WS 握手鉴权反复被拒时触发，
// 用于全局主动弹登录框。区别于用户主动 logout（不触发此事件，避免登出即弹登录框）。
const expiryListeners = new Set<() => void>()

/** 订阅「会话失效」事件。返回取消订阅函数。 */
export function onSessionExpired(cb: () => void): () => void {
  expiryListeners.add(cb)
  return () => { expiryListeners.delete(cb) }
}

/** 广播「会话失效」：只用于非自愿失效场景。订阅方（全局登录框）自行去重。 */
export function emitSessionExpired(): void {
  expiryListeners.forEach(l => { try { l() } catch { /* ignore */ } })
}

function readUser(): AuthUser | null {
  const s = localStorage.getItem(USER_KEY)
  if (!s) return null
  try { return JSON.parse(s) as AuthUser } catch { return null }
}

function readPerms(): string[] {
  const s = localStorage.getItem(PERMS_KEY)
  if (!s) return []
  try { const v = JSON.parse(s); return Array.isArray(v) ? v as string[] : [] } catch { return [] }
}

function readSuperAdmin(): boolean {
  return localStorage.getItem(SUPERADMIN_KEY) === 'true'
}

let snapshot: {
  token: string | null
  user: AuthUser | null
  permissionCodes: string[]
  superAdmin: boolean
} = {
  token: localStorage.getItem(TOKEN_KEY),
  user: readUser(),
  permissionCodes: readPerms(),
  superAdmin: readSuperAdmin(),
}

function notify() {
  snapshot = {
    token: localStorage.getItem(TOKEN_KEY),
    user: readUser(),
    permissionCodes: readPerms(),
    superAdmin: readSuperAdmin(),
  }
  listeners.forEach(l => l())
}

// localStorage 的 storage 事件只在其它同源窗口触发；本窗口写入仍由 storeTokens/logout 主动 notify。
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === null || AUTH_STORAGE_KEYS.has(event.key)) notify()
  })
}

function storeTokens(r: LoginResponse) {
  localStorage.setItem(TOKEN_KEY, r.accessToken)
  localStorage.setItem(REFRESH_KEY, r.refreshToken)
  localStorage.setItem(EXPIRES_KEY, String(Date.now() + r.expiresIn * 1000))
  localStorage.setItem(USER_KEY, JSON.stringify(r.user))
  localStorage.setItem(PERMS_KEY, JSON.stringify(r.permissionCodes ?? []))
  localStorage.setItem(SUPERADMIN_KEY, String(!!r.superAdmin))
  notify()
}

export function getToken(): string | null {
  // 建连与请求必须读取共享存储的即时值；storage 事件派发前，内存快照可能仍是上一窗口的旧 token。
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser(): AuthUser | null {
  return snapshot.user
}

/** 当前登录用户的权限码快照（来自登录/刷新下发，落 localStorage）。 */
export function getPermissionCodes(): string[] {
  return snapshot.permissionCodes
}

/** 当前用户是否超级管理员（bypass 全部权限校验）。 */
export function isSuperAdmin(): boolean {
  return snapshot.superAdmin
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try { const j = await res.json(); msg = j.message || msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  const r = (await res.json()) as LoginResponse
  storeTokens(r)
  return r.user
}

/** 登出时一并清除的「敏感模块本地缓存」——避免换非管理员账号后还能从 localStorage 看到上一用户数据。 */
const SENSITIVE_CACHE_KEYS = ['kai-toolbox:resume:state']

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(EXPIRES_KEY)
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(PERMS_KEY)
  localStorage.removeItem(SUPERADMIN_KEY)
  for (const k of SENSITIVE_CACHE_KEYS) localStorage.removeItem(k)
  notify()
}

let refreshPromise: Promise<void> | null = null

/**
 * 确保 access token 新鲜：临近/已过期且有 refresh token 时，用 refresh 续期（跨窗口去重并发）。
 * 软鉴权端点对过期 token 返回的是空响应而非 401，无法靠 401 触发刷新，故这里按 expiresAt 主动续期。
 * 在每次 http() 请求和视频探测前调用。刷新失败则登出。
 */
export async function ensureFreshToken(force = false, rejectedAccessToken?: string | null): Promise<void> {
  const tokenAtRequest = localStorage.getItem(TOKEN_KEY)
  const refreshAtRequest = localStorage.getItem(REFRESH_KEY)
  if (!tokenAtRequest || !refreshAtRequest) return
  const expiresAt = Number(localStorage.getItem(EXPIRES_KEY) || 0)
  // force=true 时跳过 expiresAt 快捷判断，强制续期一次：治「本地以为 token 还新鲜、服务端却已拒」
  // （后端重启换签名密钥、客户端时钟偏移、服务端 TTL 更短）导致的握手死循环。
  if (!force && expiresAt && Date.now() < expiresAt - REFRESH_MARGIN_MS) return

  if (!refreshPromise) {
    const operation = withAuthRefreshLock(async () => {
      // 等待跨窗口锁期间，另一窗口可能已经轮换过一次性 refresh token。进入临界区后必须重新读取。
      const currentToken = localStorage.getItem(TOKEN_KEY)
      const currentRefreshToken = localStorage.getItem(REFRESH_KEY)
      if (!currentToken || !currentRefreshToken) {
        notify()
        return
      }
      const currentExpiresAt = Number(localStorage.getItem(EXPIRES_KEY) || 0)
      const tokenThatWasRejected = rejectedAccessToken ?? tokenAtRequest
      if (force && currentToken !== tokenThatWasRejected) {
        notify()
        return
      }
      if (!force && currentExpiresAt && Date.now() < currentExpiresAt - REFRESH_MARGIN_MS) {
        notify()
        return
      }

      const requestController = new AbortController()
      const requestTimeoutId = window.setTimeout(
        () => requestController.abort(),
        REFRESH_REQUEST_TIMEOUT_MS,
      )
      try {
        const res = await fetch(`${API}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: currentRefreshToken }),
          signal: requestController.signal,
        })
        if (res.ok) {
          // 用户可能在请求在途期间重新登录；旧刷新响应不得覆盖更新后的账号或凭证。
          if (localStorage.getItem(REFRESH_KEY) !== currentRefreshToken) {
            notify()
            return
          }
          storeTokens((await res.json()) as LoginResponse)
          return
        }
        // 只有 401 才代表 refresh token 确实失效 → 登出并弹登录框。
        if (res.status === 401) {
          // 请求在途期间另一窗口可能已经刷新成功。旧 refresh token 的 401 不能覆盖新登录态。
          if (localStorage.getItem(REFRESH_KEY) !== currentRefreshToken) {
            notify()
            return
          }
          logout()
          emitSessionExpired()
          return
        }
        // 5xx / 其它（后端瞬时错误、重启中）：不把用户踢下线，保留会话下次再刷；真失效时后续 401 会兜住。
        console.warn(`[auth] token 刷新暂时失败（HTTP ${res.status}），保留会话稍后重试`)
      } catch {
        const reason = requestController.signal.aborted ? '请求超时' : '网络/后端不可达'
        console.warn(`[auth] token 刷新请求失败（${reason}），保留会话稍后重试`)
      } finally {
        window.clearTimeout(requestTimeoutId)
      }
    }, REFRESH_LOCK_WAIT_MS)
    refreshPromise = operation
      .then(result => {
        if (!result.acquired) {
          console.warn('[auth] 等待其它窗口刷新超时，跳过本轮刷新并继续连接')
        }
      })
      .catch(() => {
        console.warn('[auth] token 刷新协调失败，保留会话稍后重试')
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  await refreshPromise
}

/**
 * 鉴权探针结果。
 * - valid：token 确实有效
 * - expired：后端明确拒绝（401/403），是真的失效
 * - unreachable：网络不通 / 后端 5xx / 后端没起——**不能**据此登出
 */
export type AuthProbeResult = 'valid' | 'expired' | 'unreachable'

/**
 * 主动问一次后端「我这个 token 还认不认」。
 *
 * 存在的理由：WebSocket 握手失败在浏览器里是**不可区分**的——握手被后端 403 拒绝，和网线拔了
 * 根本连不上，`onclose` 拿到的都是 code 1006，浏览器不暴露握手的 HTTP 状态码。所以「连续 N 次
 * 握手前被关 = 登录失效」这个推断在断网时必然误判，把有效 token 也清掉。
 *
 * 与其从模糊信号猜，不如直接发一个带鉴权的轻量请求让后端裁决：fetch 被 reject 就是网络问题，
 * 拿到 401/403 才是真失效。
 */
export async function probeAuth(token = localStorage.getItem(TOKEN_KEY)): Promise<AuthProbeResult> {
  if (!token) return 'expired'
  try {
    const res = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) return 'valid'
    if (res.status === 401 || res.status === 403) return 'expired'
    // 5xx / 其它：后端在重启或出错，不是凭证问题
    return 'unreachable'
  } catch {
    return 'unreachable'
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/** 订阅登录态（token + user），登录/登出/续期时组件自动刷新。 */
export function useAuth() {
  return useSyncExternalStore(subscribe, () => snapshot)
}

/**
 * 给「浏览器原生媒体请求」URL 附带 access_token 查询参数。
 * 用于 &lt;video&gt;/&lt;img&gt;/&lt;track&gt; 等无法设置 Authorization 头的场景；
 * 后端 JwtAuthFilter 会从 access_token 参数兜底取 token。未登录则原样返回。
 */
export function withAuthToken(url: string): string {
  const t = getToken()
  if (!t) return url
  return url + (url.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(t)
}
