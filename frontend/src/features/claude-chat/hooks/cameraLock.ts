/**
 * 跨标签页「摄像头单占用」协调：摄像头本质是独占资源，多个标签/程序同时开会 NotReadableError(Device in use)。
 * 用 localStorage 心跳 + BroadcastChannel 做一个轻量单持有者锁：谁在用就每秒续期，别的标签发现有新鲜持有者
 * 就不抢；持有者释放(或标签关掉后心跳过期)即通知其它标签重试。非强一致，但对「本机多标签抢摄像头」足够。
 */
const KEY = 'kai-toolbox:gesture-cam-owner'
const STALE_MS = 3000
const CHANNEL = 'kai-toolbox:gesture-cam'

const selfId = Math.random().toString(36).slice(2) + Date.now().toString(36)
let bc: BroadcastChannel | null = null
try { bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null } catch { bc = null }

function readOwner(): { id: string; ts: number } | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    return o && typeof o.id === 'string' && typeof o.ts === 'number' ? o : null
  } catch { return null }
}

function heldByOther(): boolean {
  const o = readOwner()
  return !!o && o.id !== selfId && Date.now() - o.ts < STALE_MS
}

/** 尝试占用：无人持有 / 持有者已过期 / 本来就是自己 → 成功并写入所有权。 */
export function acquireCamera(): boolean {
  if (heldByOther()) return false
  try { localStorage.setItem(KEY, JSON.stringify({ id: selfId, ts: Date.now() })) } catch { /* ignore */ }
  return true
}

/** 持有期间每秒续期；若被别人抢占返回 false（调用方应停用摄像头）。 */
export function heartbeatCamera(): boolean {
  if (heldByOther()) return false
  try { localStorage.setItem(KEY, JSON.stringify({ id: selfId, ts: Date.now() })) } catch { /* ignore */ }
  return true
}

/** 释放（仅当持有者是自己）并广播，让等待的标签立即重试。 */
export function releaseCamera(): void {
  const o = readOwner()
  if (!o || o.id === selfId) {
    try { localStorage.removeItem(KEY) } catch { /* ignore */ }
    try { bc?.postMessage('released') } catch { /* ignore */ }
  }
}

/** 订阅「摄像头被释放」事件（其它标签释放时触发），返回取消订阅。 */
export function onCameraReleased(cb: () => void): () => void {
  const onMsg = (e: MessageEvent) => { if (e.data === 'released') cb() }
  const onStorage = (e: StorageEvent) => { if (e.key === KEY && !e.newValue) cb() }
  bc?.addEventListener('message', onMsg)
  window.addEventListener('storage', onStorage)
  return () => {
    bc?.removeEventListener('message', onMsg)
    window.removeEventListener('storage', onStorage)
  }
}
