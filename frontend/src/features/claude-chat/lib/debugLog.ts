// Vibe Coding 调试日志：捕获前端 ↔ 后端(转发自 node sidecar) 的每条 WS 交互，供「调试模式」弹框实时查看，
// 帮助理解完整交互过程（收/发、时间、type、seq、完整 payload）。模块级环形缓冲 + 订阅，跨会话/组件共享。

export type DebugDir = 'recv' | 'send' | 'conn'

export interface DebugEntry {
  id: number
  ts: number
  /** recv=后端→前端(sidecar 事件)；send=前端→后端(用户/控制消息)；conn=连接生命周期 */
  dir: DebugDir
  type: string
  seq?: number
  /** 完整报文文本（recv 为原始 JSON 串；send 为序列化后的 ClientMessage；conn 为描述） */
  text: string
}

const RECENT_MAX = 300
const RECENT_TEXT_LENGTH = 4 * 1024
const ACTIVE_MAX = 2000
const ACTIVE_TEXT_LENGTH = 64 * 1024
let buf: DebugEntry[] = []
let counter = 0
let version = 0
let activeViewers = 0
const listeners = new Set<() => void>()

/** 追加一条并通知订阅者。超上限按环形丢最旧。 */
export function pushDebug(dir: DebugDir, type: string, text: string, seq?: number): void {
  counter += 1
  version += 1
  const maxTextLength = activeViewers > 0 ? ACTIVE_TEXT_LENGTH : RECENT_TEXT_LENGTH
  const maxEntries = activeViewers > 0 ? ACTIVE_MAX : RECENT_MAX
  const boundedText = text.length > maxTextLength
    ? `${text.slice(0, maxTextLength)}\n…[truncated]`
    : text
  buf.push({ id: counter, ts: Date.now(), dir, type, seq, text: boundedText })
  if (buf.length > maxEntries) buf = buf.slice(buf.length - maxEntries)
  listeners.forEach(l => { try { l() } catch { /* ignore */ } })
}

/** 调试查看器打开期间提高环形缓冲容量；关闭后继续保留轻量近期记录。 */
export function setDebugViewerActive(active: boolean): void {
  activeViewers = Math.max(0, activeViewers + (active ? 1 : -1))
}

export function getDebugLog(): DebugEntry[] {
  return buf
}

/** 单调递增版本号，供 useSyncExternalStore 做快照（buf 原地 push，用版本号感知变化）。 */
export function getDebugVersion(): number {
  return version
}

export function clearDebug(): void {
  buf = []
  version += 1
  listeners.forEach(l => { try { l() } catch { /* ignore */ } })
}

export function subscribeDebug(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
