import type { AssistantExternalLoginOptions } from './types'

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

interface ForgeLoginResponse {
  accessToken: string
  expiresIn: number
}

interface PersistedExternalLogin {
  accessToken: string
  expiresAt: number
}

type LoginStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const STORAGE_KEY_PREFIX = 'kai-assistant:external-login:'

/** Forge 外部登录客户端；密码只参与单次请求，短期 ACCESS token 限于当前标签页。 */
export class AssistantExternalLoginClient {
  private readonly options: AssistantExternalLoginOptions
  private readonly fetcher: Fetcher
  private readonly storage?: LoginStorage
  private readonly storageKey: string
  private accessToken?: string
  private expiresAt = 0

  constructor(
    options: AssistantExternalLoginOptions,
    fetcher: Fetcher = globalThis.fetch.bind(globalThis),
    storage: LoginStorage | undefined = resolveSessionStorage(),
  ) {
    this.options = options
    this.fetcher = fetcher
    this.storage = storage
    this.storageKey = `${STORAGE_KEY_PREFIX}${options.loginUrl}`
    this.restore()
  }

  async login(username: string, password: string): Promise<void> {
    const response = await this.fetcher(this.options.loginUrl, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const body = await readResponseBody(response)
    if (!response.ok) {
      this.clear()
      throw new Error(loginFailureMessage(response.status, body))
    }
    const login = parseLoginResponse(body)
    this.accessToken = login.accessToken
    this.expiresAt = Date.now() + login.expiresIn * 1000
    this.persist()
  }

  isAuthenticated(): boolean {
    return Boolean(this.accessToken) && Date.now() < this.expiresAt
  }

  requireAccessToken(): string {
    if (!this.isAuthenticated()) {
      this.clear()
      throw new Error('Forge 登录已失效，请重新登录')
    }
    return this.accessToken as string
  }

  clear(): void {
    this.accessToken = undefined
    this.expiresAt = 0
    try {
      this.storage?.removeItem(this.storageKey)
    } catch {
      // 浏览器拒绝会话存储时仍保持内存态可用。
    }
  }

  private restore(): void {
    try {
      const raw = this.storage?.getItem(this.storageKey)
      if (!raw) return
      const restored = JSON.parse(raw) as unknown
      if (!isRecord(restored) || typeof restored.accessToken !== 'string'
          || typeof restored.expiresAt !== 'number' || restored.expiresAt <= Date.now()) {
        this.clear()
        return
      }
      this.accessToken = restored.accessToken
      this.expiresAt = restored.expiresAt
    } catch {
      this.clear()
    }
  }

  private persist(): void {
    const persisted: PersistedExternalLogin = {
      accessToken: this.accessToken as string,
      expiresAt: this.expiresAt,
    }
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(persisted))
    } catch {
      // sessionStorage 不可用时降级为当前实例内存态。
    }
  }
}

function resolveSessionStorage(): LoginStorage | undefined {
  try {
    return globalThis.sessionStorage
  } catch {
    return undefined
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function parseLoginResponse(value: unknown): ForgeLoginResponse {
  if (!isRecord(value) || typeof value.accessToken !== 'string' || !value.accessToken.trim()
      || typeof value.expiresIn !== 'number' || !Number.isFinite(value.expiresIn) || value.expiresIn <= 0) {
    throw new Error('Forge 登录响应缺少有效的 ACCESS Token')
  }
  return { accessToken: value.accessToken, expiresIn: value.expiresIn }
}

function loginFailureMessage(status: number, value: unknown): string {
  if (status === 401 || status === 403) return 'Forge 账号或密码不正确'
  if (isRecord(value) && typeof value.message === 'string' && value.message.trim()) return value.message
  return `Forge 登录失败（HTTP ${status}）`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
