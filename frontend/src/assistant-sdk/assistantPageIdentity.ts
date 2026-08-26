import type { AssistantPageContext } from './types'

const SENSITIVE_QUERY_KEY = /(^|[-_])(access[-_]?token|auth|authorization|password|passwd|pwd|secret|session[-_]?token)($|[-_])/i

export interface AssistantPageIdentity {
  appId: string
  pageKey: string
  pageUrl: string
}

/** 生成“系统 + 规范化 URL”身份；认证用户由服务端握手补齐。 */
export function resolveAssistantPageIdentity(
  appId: string,
  page?: AssistantPageContext,
  baseUrl = typeof window === 'undefined' ? undefined : window.location.href,
): AssistantPageIdentity | undefined {
  if (!appId.trim() || !page?.url?.trim() || !baseUrl) return undefined
  try {
    const url = new URL(page.url, baseUrl)
    url.hash = ''
    const entries = [...url.searchParams.entries()]
      .filter(([key]) => !SENSITIVE_QUERY_KEY.test(key))
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue))
    url.search = ''
    entries.forEach(([key, value]) => url.searchParams.append(key, value))
    const normalized = url.toString()
    return { appId: appId.trim(), pageKey: normalized, pageUrl: normalized }
  } catch {
    return undefined
  }
}

export function assistantPageStorageSuffix(identity?: AssistantPageIdentity): string {
  if (!identity) return 'unbound'
  let hash = 0x811c9dc5
  for (const character of identity.pageKey) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
