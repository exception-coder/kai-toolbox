import type { AssistantPageContext } from './types'

/** 从浏览器当前位置生成页面上下文；跨路径时不沿用可能失效的宿主路由名。 */
export function currentAssistantPageContext(previous?: AssistantPageContext): AssistantPageContext {
  const url = window.location.href
  const routeName = previous?.routeName && samePagePath(previous.url, url) ? previous.routeName : undefined
  return {
    url,
    title: document.title || previous?.title,
    ...(routeName ? { routeName } : {}),
  }
}

/** 统一观察浏览器 History API 与前进后退，返回幂等清理函数。 */
export function observeAssistantPageNavigation(onChange: () => void): () => void {
  let active = true
  let scheduled = false
  let currentUrl = window.location.href
  const history = window.history
  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState

  const check = () => {
    scheduled = false
    if (!active || window.location.href === currentUrl) return
    currentUrl = window.location.href
    onChange()
  }
  const schedule = () => {
    if (scheduled || !active) return
    scheduled = true
    queueMicrotask(check)
  }
  const pushState: History['pushState'] = function (this: History, data, unused, url) {
    originalPushState.call(this, data, unused, url)
    schedule()
  }
  const replaceState: History['replaceState'] = function (this: History, data, unused, url) {
    originalReplaceState.call(this, data, unused, url)
    schedule()
  }

  history.pushState = pushState
  history.replaceState = replaceState
  window.addEventListener('popstate', schedule)
  window.addEventListener('hashchange', schedule)

  return () => {
    if (!active) return
    active = false
    window.removeEventListener('popstate', schedule)
    window.removeEventListener('hashchange', schedule)
    if (history.pushState === pushState) history.pushState = originalPushState
    if (history.replaceState === replaceState) history.replaceState = originalReplaceState
  }
}

function samePagePath(previousUrl: string, currentUrl: string): boolean {
  try {
    const previous = new URL(previousUrl, currentUrl)
    const current = new URL(currentUrl)
    return previous.origin === current.origin && previous.pathname === current.pathname
  } catch {
    return false
  }
}
