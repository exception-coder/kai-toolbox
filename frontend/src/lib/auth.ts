import { useSyncExternalStore } from 'react'

// 与 lib/api.ts 中读取的 key 保持一致（api.ts 为避免循环依赖直接读字符串字面量）
const TOKEN_KEY = 'toolbox.auth.token'
const REFRESH_KEY = 'toolbox.auth.refresh'
const EXPIRES_KEY = 'toolbox.auth.expiresAt'
const USER_KEY = 'toolbox.auth.user'

const API = '/api'
/** access token 过期前多久就提前刷新（毫秒）。 */
const REFRESH_MARGIN_MS = 30_000

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
}

const listeners = new Set<() => void>()

function readUser(): AuthUser | null {
  const s = localStorage.getItem(USER_KEY)
  if (!s) return null
  try { return JSON.parse(s) as AuthUser } catch { return null }
}

let snapshot: { token: string | null; user: AuthUser | null } = {
  token: localStorage.getItem(TOKEN_KEY),
  user: readUser(),
}

function notify() {
  snapshot = { token: localStorage.getItem(TOKEN_KEY), user: readUser() }
  listeners.forEach(l => l())
}

function storeTokens(r: LoginResponse) {
  localStorage.setItem(TOKEN_KEY, r.accessToken)
  localStorage.setItem(REFRESH_KEY, r.refreshToken)
  localStorage.setItem(EXPIRES_KEY, String(Date.now() + r.expiresIn * 1000))
  localStorage.setItem(USER_KEY, JSON.stringify(r.user))
  notify()
}

export function getToken(): string | null {
  return snapshot.token
}

export function getUser(): AuthUser | null {
  return snapshot.user
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
  for (const k of SENSITIVE_CACHE_KEYS) localStorage.removeItem(k)
  notify()
}

let refreshPromise: Promise<void> | null = null

/**
 * 确保 access token 新鲜：临近/已过期且有 refresh token 时，用 refresh 续期（去重并发）。
 * 软鉴权端点对过期 token 返回的是空响应而非 401，无法靠 401 触发刷新，故这里按 expiresAt 主动续期。
 * 在每次 http() 请求和视频探测前调用。刷新失败则登出。
 */
export async function ensureFreshToken(): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY)
  const refreshToken = localStorage.getItem(REFRESH_KEY)
  if (!token || !refreshToken) return
  const expiresAt = Number(localStorage.getItem(EXPIRES_KEY) || 0)
  if (expiresAt && Date.now() < expiresAt - REFRESH_MARGIN_MS) return

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (!res.ok) throw new Error('refresh failed')
        storeTokens((await res.json()) as LoginResponse)
      } catch {
        logout()
      } finally {
        refreshPromise = null
      }
    })()
  }
  await refreshPromise
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
  const t = snapshot.token
  if (!t) return url
  return url + (url.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(t)
}
