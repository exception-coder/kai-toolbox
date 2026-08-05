import type { QuickSiteView } from '../types'

export function openSite(site: QuickSiteView) {
  if (site.openMode === 'CURRENT') {
    window.location.assign(site.siteUrl)
    return
  }

  const features = site.openMode === 'POPUP' ? popupFeatures(site) : undefined
  const target = site.openMode === 'POPUP' ? `kai-quick-site-${site.id}` : '_blank'
  const popup = window.open(site.siteUrl, target, features)
  if (!popup) {
    throw new Error('浏览器拦截了窗口，请允许 Forge 打开弹出式窗口')
  }
  try {
    popup.opener = null
  } catch {
    // 部分跨域窗口不允许修改 opener；窗口本身仍可正常使用。
  }
  popup.focus()
}

function popupFeatures(site: QuickSiteView) {
  const width = Math.min(site.windowWidth, window.screen.availWidth)
  const height = Math.min(site.windowHeight, window.screen.availHeight)
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2))
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2))
  return [
    'popup=yes',
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'resizable=yes',
    'scrollbars=yes',
  ].join(',')
}
