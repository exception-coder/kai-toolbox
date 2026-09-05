import type { AssistantExternalLoginOptions, AssistantInitOptions } from './types'

const CONSULT_WEBSOCKET_PATH = '/api/claude-chat/consult/ws'
const EXTERNAL_LOGIN_PATH = '/api/auth/external-login'

export interface AssistantConnectionOptions {
  requestBaseUrl?: string
  wsUrl?: string
  externalLogin?: AssistantExternalLoginOptions
}

/** 将宿主配置收敛为单一 HTTP(S) Origin，避免路径和凭据泄漏到派生端点。 */
export function normalizeAssistantRequestBaseUrl(value: string): string {
  const url = new URL(value, window.location.href)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Assistant requestBaseUrl 仅支持 HTTP(S) 请求域')
  }
  if (url.username || url.password) {
    throw new Error('Assistant requestBaseUrl 不得包含用户凭据')
  }
  return url.origin
}

export function requestBaseUrlFromSdkBaseUrl(sdkBaseUrl: string): string {
  return normalizeAssistantRequestBaseUrl(sdkBaseUrl)
}

export function resolveAssistantConnectionOptions(options: AssistantInitOptions): AssistantConnectionOptions {
  const requestBaseUrl = options.requestBaseUrl
    ? normalizeAssistantRequestBaseUrl(options.requestBaseUrl)
    : undefined
  const wsUrl = options.wsUrl ?? (requestBaseUrl
    ? resolveWebSocketEndpoint(requestBaseUrl, CONSULT_WEBSOCKET_PATH)
    : undefined)
  const externalLogin = options.externalLogin
    ? {
        ...options.externalLogin,
        loginUrl: options.externalLogin.loginUrl
          ?? (requestBaseUrl ? new URL(EXTERNAL_LOGIN_PATH, `${requestBaseUrl}/`).href : undefined),
      }
    : undefined

  if (externalLogin && !externalLogin.loginUrl) {
    throw new Error('Assistant 外部登录需要 requestBaseUrl 或 externalLogin.loginUrl')
  }
  return { requestBaseUrl, wsUrl, externalLogin }
}

function resolveWebSocketEndpoint(requestBaseUrl: string, path: string): string {
  const url = new URL(path, `${requestBaseUrl}/`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.href
}
