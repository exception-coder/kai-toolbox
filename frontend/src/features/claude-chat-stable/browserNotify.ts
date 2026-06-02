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

/**
 * 权限/提问弹框出现时弹系统通知。权限/提问是阻塞进度、必须用户处理的高信号事件，
 * 故不再因「页面在前台」而抑制（移动端切走时 JS 多被挂起、消息根本到不了，靠前台判断等于永不弹）。
 * renotify 让连续多个弹框都能重新提醒，而非同 tag 静默替换。
 */
export function notifyPrompt(title: string, body: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

  const options: NotificationOptions = {
    body,
    // 唯一 tag：保证连续多个弹框都重新提醒，而非同 tag 被系统静默替换（与可用的测试通知一致）
    tag: 'claude-chat-prompt-' + Date.now(),
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

/** 调试用：忽略前台判断、当场请求权限并弹一条测试通知，返回人类可读的诊断结果。 */
export async function testNotify(): Promise<string> {
  if (typeof Notification === 'undefined') return '❌ 此浏览器不支持 Notification API'
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return '❌ 非安全上下文（需 https 或 localhost），通知 API 不可用'
  }
  let perm = Notification.permission
  if (perm === 'default') perm = await Notification.requestPermission()
  if (perm !== 'granted') {
    return `❌ 通知权限：${perm}。请在浏览器“站点设置 → 通知”里手动允许后重试`
  }
  const options: NotificationOptions = {
    body: '看到这条说明通知链路正常 ✅',
    // 每次唯一 tag：macOS/部分系统对相同 tag 会静默替换、不再重新弹横幅，唯一 tag 保证每次都弹
    tag: 'claude-chat-test-' + Date.now(),
    data: { url: '/tools/claude-chat' },
  }
  const reg = await getSwReg()
  if (reg) {
    try {
      await reg.showNotification('Claude 测试通知', options)
      return '✅ 已通过 Service Worker 发出（PC / 移动端通用路径）。没看到就查系统“勿扰/专注模式”与浏览器站点通知开关'
    } catch (e) {
      return '⚠️ Service Worker showNotification 失败：' + errText(e)
    }
  }
  try {
    const n = new Notification('Claude 测试通知', options)
    n.onclick = () => { window.focus(); n.close() }
    return '✅ 已通过 Notification 构造器发出（桌面回退路径，SW 不可用时）'
  } catch (e) {
    return '❌ showNotification 与构造器都失败：' + errText(e)
  }
}

/** 注册并取活跃 SW；ready 极端情况下可能不 resolve，加 3s 超时兜底。 */
async function getSwReg(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    await navigator.serviceWorker.register('/sw.js')
  } catch {
    return null
  }
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
  ])
}

function errText(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e)
}
