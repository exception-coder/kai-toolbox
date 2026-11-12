// Vibe Coding 调试日志：捕获前端 ↔ 后端(转发自 node sidecar) 的每条 WS 交互，供「调试模式」弹框实时查看，
// 保留有界报文摘要（收/发、时间、type、seq），避免诊断缓存反过来占满页面内存。跨会话/组件共享。

export type DebugDir = 'recv' | 'send' | 'conn'

export interface DebugEntry {
  id: number
  ts: number
  /** recv=后端→前端(sidecar 事件)；send=前端→后端(用户/控制消息)；conn=连接生命周期 */
  dir: DebugDir
  type: string
  seq?: number
  /** 有长度上限的报文文本；截断记录带标记，不作为完整历史存储。 */
  text: string
}

const RECENT_MAX = 300
const RECENT_TEXT_LENGTH = 4 * 1024
const RECENT_BYTES = 1024 * 1024
const ACTIVE_MAX = 2000
const ACTIVE_TEXT_LENGTH = 64 * 1024
const ACTIVE_BYTES = 8 * 1024 * 1024
const TYPE_LENGTH = 256
const TRUNCATED = '\n…[truncated]'
let buf: DebugEntry[] = []
let bufferedBytes = 0
let counter = 0
let version = 0
let activeViewers = 0
const listeners = new Set<() => void>()

function copyExcerpt(text: string, limit: number): string {
  // V8 的 slice/拼接可能继续引用整条原始报文。split/join 仅复制有界部分，
  // 形成独立字符串，同时保留 UTF-16 内容（包括原始孤立代理项）。
  let end = Math.min(text.length, limit)
  if (end < text.length && /[\uD800-\uDBFF]/.test(text.charAt(end - 1))
    && /[\uDC00-\uDFFF]/.test(text.charAt(end))) end -= 1
  const excerpt = text.slice(0, end).split('').join('')
  return end < text.length ? excerpt + TRUNCATED : excerpt
}

function entryBytes(entry: DebugEntry): number {
  // 按双字节字符串保守计数，额外预留固定元数据；不是整个 JS 堆的精确计量。
  return (entry.text.length + entry.type.length) * 2 + 64
}

function trimBuffer(): void {
  const maxEntries = activeViewers > 0 ? ACTIVE_MAX : RECENT_MAX
  const maxBytes = activeViewers > 0 ? ACTIVE_BYTES : RECENT_BYTES
  let removeCount = 0
  while (buf.length - removeCount > maxEntries || bufferedBytes > maxBytes) {
    bufferedBytes -= entryBytes(buf[removeCount++])
  }
  if (removeCount > 0) buf = buf.slice(removeCount)
}

function notify(): void {
  version += 1
  listeners.forEach(l => { try { l() } catch { /* isolate diagnostic subscribers */ } })
}

/** 追加一条并通知订阅者。超上限按环形丢最旧。 */
export function pushDebug(dir: DebugDir, type: string, text: string, seq?: number): void {
  counter += 1
  const maxTextLength = activeViewers > 0 ? ACTIVE_TEXT_LENGTH : RECENT_TEXT_LENGTH
  const entry = { id: counter, ts: Date.now(), dir, type: copyExcerpt(type, TYPE_LENGTH), seq, text: copyExcerpt(text, maxTextLength) }
  buf.push(entry)
  bufferedBytes += entryBytes(entry)
  trimBuffer()
  notify()
}

/** 调试查看器打开期间提高环形缓冲容量；关闭后继续保留轻量近期记录。 */
export function setDebugViewerActive(active: boolean): void {
  const wasActive = activeViewers > 0
  activeViewers = Math.max(0, activeViewers + (active ? 1 : -1))
  if (wasActive && activeViewers === 0) {
    // 即使没有下一条事件，关闭最后一个查看器也立即释放大容量诊断记录。
    buf = buf.slice(-RECENT_MAX).map(entry => ({ ...entry, text: copyExcerpt(entry.text, RECENT_TEXT_LENGTH) }))
    bufferedBytes = buf.reduce((bytes, entry) => bytes + entryBytes(entry), 0)
    trimBuffer()
    notify()
  }
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
  bufferedBytes = 0
  notify()
}

export function subscribeDebug(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
