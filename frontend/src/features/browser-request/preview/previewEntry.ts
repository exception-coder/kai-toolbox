import type { PreviewTarget } from './api'

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

export function previewTargetFromSearch(params: URLSearchParams): PreviewTarget {
  return { requestKey: params.get('requestKey') || crypto.randomUUID(), origin: window.location.origin,
    route: params.get('route') || '/tools/fore-consult', device: params.get('device') === 'phone' ? 'phone' : 'desktop',
    scene: params.get('scene') === 'consult-image' ? 'consult-image' : 'page',
    resourceId: params.get('resourceId') || undefined, loginPage: params.get('loginPage') || undefined,
    readySelector: params.get('readySelector') || undefined, sourceRevision: params.get('sourceRevision') || undefined }
}
