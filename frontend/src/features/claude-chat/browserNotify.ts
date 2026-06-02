// 权限/提问弹框的浏览器原生通知：页面不在前台时提醒用户回来处理，与屏幕上的弹窗互补。
//
// 移动端（Android / 鸿蒙浏览器）禁用 new Notification() 构造器，必须经 Service Worker 的
// registration.showNotification() 弹出；桌面两者皆可。因此优先走 SW，退回构造器。
// 注意：无论哪条都只在「页面 JS 存活」时有效——锁屏/杀后台等彻底后台场景靠服务端 Bark/ntfy 兜底。

let permRequested = false
let swRegistering = false

/** 在用户手势时机注册 SW + 申请一次通知权限（多数浏览器要求由手势触发）。幂等。 */
export function ensureNotifyPermission(): void {
  if (typeof Notification === 'undefined') return
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !swRegistering) {
    swRegistering = true
    navigator.serviceWorker.register('/sw.js').catch(() => { /* 安全上下文外/不支持，忽略 */ })
  }
  if (!permRequested && Notification.permission === 'default') {
    permRequested = true
    void Notification.requestPermission()
  }
}

/** 已授权且页面不在前台时弹系统通知；前台可见时不打扰（屏幕已有弹窗）。 */
export function notifyPrompt(title: string, body: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  if (typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus()) return

  const options: NotificationOptions = {
    body,
    tag: 'claude-chat-prompt',
    data: { url: '/tools/claude-chat' },
  }

  // 优先 Service Worker（移动端唯一可行路径）；失败再退回构造器（桌面兜底）。
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then(reg => reg.showNotification(title, options))
      .catch(() => fallbackConstruct(title, options))
    return
  }
  fallbackConstruct(title, options)
}

function fallbackConstruct(title: string, options: NotificationOptions): void {
  try {
    const n = new Notification(title, options)
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    // 移动端构造器被禁会抛错，忽略（此路径只在无 SW 的桌面环境命中）
  }
}
