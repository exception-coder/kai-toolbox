import type { AssistantContextSnapshot } from './types'

export const MODULE_CONTEXT_CONTRIBUTION_KEY = 'assistantModuleExploration'
export const MAX_MODULE_CONTEXT_SUMMARY_LENGTH = 6_000

export interface AssistantModuleIdentity {
  appId: string
  moduleKey: string
  route: string
  sourceRevision: string
}

/** 从宿主声明的 routeName 或去参数化 URL 推导稳定模块标识。 */
export function resolveModuleIdentity(snapshot: AssistantContextSnapshot): AssistantModuleIdentity | undefined {
  const appId = snapshot.application.appId.trim()
  const routeName = snapshot.page?.routeName?.trim()
  const route = normalizeRoute(snapshot.page?.url)
  const moduleKey = routeName || route
  if (!appId || !moduleKey) return undefined
  return {
    appId,
    moduleKey: moduleKey.slice(0, 240),
    route: (snapshot.page?.url?.trim() || route).slice(0, 1_000),
    sourceRevision: snapshot.application.sourceRevision?.trim().slice(0, 160) ?? '',
  }
}

/** 对最终回答做确定性有界压缩；不再调用模型，避免额外成本与不稳定输出。 */
export function compressModuleContextSummary(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim()
  if (normalized.length <= MAX_MODULE_CONTEXT_SUMMARY_LENGTH) return normalized
  const marker = '\n\n[中间内容已压缩]\n\n'
  const available = MAX_MODULE_CONTEXT_SUMMARY_LENGTH - marker.length
  const headLength = Math.ceil(available * 0.7)
  return normalized.slice(0, headLength) + marker + normalized.slice(-(available - headLength))
}

function normalizeRoute(value?: string): string {
  if (!value?.trim()) return ''
  try {
    const url = new URL(value, window.location.href)
    return normalizePath(url.pathname)
  } catch {
    return normalizePath(value.split(/[?#]/, 1)[0])
  }
}

function normalizePath(value: string): string {
  const segments = value.split('/').filter(Boolean).map(segment => {
    const decoded = safeDecode(segment)
    if (/^\d+$/.test(decoded) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(decoded)) return ':id'
    return decoded.toLowerCase()
  })
  return segments.length > 0 ? `/${segments.join('/')}` : '/'
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
