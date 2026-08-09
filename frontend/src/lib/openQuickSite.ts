import type { QuickSiteOpenMode, QuickSiteSummary } from '@/lib/quickSites'

const OPEN_SITE_WINDOWS = new Map<string, { window: Window; targetUrl: string }>()

/** 按站点窗口行为打开页面；会话可通过 override 强制使用独立窗口。 */
export function openQuickSite(site: QuickSiteSummary, override?: QuickSiteOpenMode, forceNavigate = false) {
  const openMode = override ?? site.openMode
  const targetUrl = site.windowBehavior === 'STANDARD' ? site.siteUrl : controlledWindowUrl(site.id)
  if (openMode === 'CURRENT') {
    window.location.assign(targetUrl)
    return
  }
  if (openMode === 'POPUP' && focusExistingSiteWindow(site.id, targetUrl, forceNavigate)) {
    return
  }
  const popup = window.open(
    targetUrl,
    openMode === 'POPUP' ? `kai-quick-site-${site.id}` : '_blank',
    openMode === 'POPUP' ? popupFeatures(site) : undefined,
  )
  if (!popup) throw new Error('浏览器拦截了窗口，请允许 Forge 打开弹出式窗口')
  if (openMode === 'POPUP') {
    OPEN_SITE_WINDOWS.set(site.id, { window: popup, targetUrl })
  }
  try {
    popup.opener = null
  } catch {
    // 跨域窗口可能拒绝修改 opener，但不影响站点窗口继续使用。
  }
  popup.focus()
}

/** 已打开的站点保持当前页面状态，再次点击时只唤醒窗口。 */
function focusExistingSiteWindow(siteId: string, targetUrl: string, forceNavigate: boolean) {
  const entry = OPEN_SITE_WINDOWS.get(siteId)
  if (!entry) return false
  if (entry.window.closed) {
    OPEN_SITE_WINDOWS.delete(siteId)
    return false
  }
  if (forceNavigate) {
    entry.window.close()
    OPEN_SITE_WINDOWS.delete(siteId)
    return false
  }
  if (entry.targetUrl !== targetUrl) {
    entry.window.location.assign(targetUrl)
    entry.targetUrl = targetUrl
  }
  entry.window.focus()
  return true
}

function controlledWindowUrl(siteId: string) {
  const url = new URL('/tools/quick-launch/window', window.location.origin)
  url.searchParams.set('siteId', siteId)
  return url.toString()
}

function popupFeatures(site: QuickSiteSummary) {
  const width = Math.min(site.windowWidth, window.screen.availWidth)
  const height = Math.min(site.windowHeight, window.screen.availHeight)
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2))
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2))
  return `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
}
