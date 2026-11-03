import type { PreviewTarget } from './api'
export const INLINE_PREVIEW_SUPPRESS_PARAM = '__forge_inline_preview'
const previewTabKey = 'forge.preview-render-tab'
export function inlinePagePreviewsSuppressed() {
  const marked = new URLSearchParams(window.location.search).get(INLINE_PREVIEW_SUPPRESS_PARAM) === '1'
  try {
    if (marked) sessionStorage.setItem(previewTabKey, '1')
    return marked || sessionStorage.getItem(previewTabKey) === '1'
  } catch { return marked }
}
// Capture the render-tab marker before the workbench normalizes its route.
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get(INLINE_PREVIEW_SUPPRESS_PARAM) === '1') inlinePagePreviewsSuppressed()

export function previewDisplayRoute(route: string) {
  try {
    const url = new URL(route, window.location.origin)
    url.searchParams.delete(INLINE_PREVIEW_SUPPRESS_PARAM)
    return url.pathname + url.search + url.hash
  } catch { return route }
}

export function pagePreviewEntryFromHref(href: string | null): string | null {
  if (!href) return null
  try {
    const url = new URL(href, window.location.origin)
    if (url.origin !== window.location.origin || url.username || url.password
      || !/^\/tools\/fore-consult\/preview(?:\/[\w-]+)?$/.test(url.pathname)
      || [...url.searchParams.keys()].some(key => /token|password|secret/i.test(key))) return null
    return url.pathname + url.search + url.hash
  } catch { return null }
}

/** Only complete prepared entries (or existing preview IDs) qualify for automatic embedding. */
export function inlinePagePreviewEntryFromHref(href: string | null): string | null {
  const safe = pagePreviewEntryFromHref(href)
  if (!safe) return null
  const url = new URL(safe, window.location.origin)
  if (url.pathname.split('/')[4]) return safe
  const route = url.searchParams.get('route')
  if (url.searchParams.get('auto') !== '1' || !route || !/^\/(?![\\/])/.test(route) || route.includes('\\')) return null
  if (/^\/tools\/fore-consult\/preview(?:\/|$)/.test(new URL(route, window.location.origin).pathname)) return null
  return safe
}

export function previewTargetFromSearch(params: URLSearchParams): PreviewTarget {
  return { requestKey: params.get('requestKey') || crypto.randomUUID(), origin: window.location.origin,
    route: params.get('route') || '/tools/fore-consult', device: params.get('device') === 'phone' ? 'phone' : 'desktop',
    scene: params.get('scene') === 'consult-image' ? 'consult-image' : 'page',
    resourceId: params.get('resourceId') || undefined, loginPage: params.get('loginPage') || undefined,
    readySelector: params.get('readySelector') || undefined, sourceRevision: params.get('sourceRevision') || undefined }
}
