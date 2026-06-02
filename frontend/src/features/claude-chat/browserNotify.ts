// 权限/提问弹框的浏览器原生通知：页面不在前台时提醒用户回来处理，与屏幕上的弹窗互补。

let requested = false

/** 在用户手势时机请求一次通知权限（多数浏览器要求由手势触发）。幂等。 */
export function ensureNotifyPermission(): void {
  if (typeof Notification === 'undefined') return
  if (requested || Notification.permission !== 'default') return
  requested = true
  void Notification.requestPermission()
}

/** 仅在已授权且页面不在前台时弹系统通知；点击聚焦回页面。前台可见时不打扰（弹窗已在屏上）。 */
export function notifyPrompt(title: string, body: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  if (typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus()) return
  try {
    const n = new Notification(title, { body, tag: 'claude-chat-prompt' })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    // 某些环境（非 https/权限策略）会抛错，忽略即可
  }
}
