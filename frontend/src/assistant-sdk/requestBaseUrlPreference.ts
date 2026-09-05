import { normalizeAssistantRequestBaseUrl } from './requestBaseUrl'

const REQUEST_BASE_URL_STORAGE_PREFIX = 'kai-assistant:request-base-url:'

export function readAssistantRequestBaseUrlPreference(appId: string): string | undefined {
  try {
    const value = window.localStorage.getItem(storageKey(appId))
    return value ? normalizeAssistantRequestBaseUrl(value) : undefined
  } catch {
    return undefined
  }
}

export function writeAssistantRequestBaseUrlPreference(appId: string, requestBaseUrl?: string): void {
  const key = storageKey(appId)
  if (!requestBaseUrl) {
    window.localStorage.removeItem(key)
    return
  }
  window.localStorage.setItem(key, normalizeAssistantRequestBaseUrl(requestBaseUrl))
}

export function validateAssistantUserRequestBaseUrl(requestBaseUrl: string,
  pageProtocol = window.location.protocol): string {
  const normalized = normalizeAssistantRequestBaseUrl(requestBaseUrl)
  if (pageProtocol === 'https:' && new URL(normalized).protocol === 'http:') {
    throw new Error('当前页面使用 HTTPS，请填写 HTTPS 内网地址或使用同源代理。')
  }
  return normalized
}

function storageKey(appId: string): string {
  return `${REQUEST_BASE_URL_STORAGE_PREFIX}${encodeURIComponent(appId)}`
}
