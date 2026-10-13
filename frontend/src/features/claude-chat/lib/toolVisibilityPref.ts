import { useSyncExternalStore } from 'react'

/** 工具调用气泡默认隐藏；保留用户显式选择，纯前端持久化并跨视图同步。 */
const KEY = 'kai-toolbox:claude-chat:hide-tool-calls'
const listeners = new Set<() => void>()

function read(): boolean {
  try { return localStorage.getItem(KEY) !== '0' } catch { return true }
}

export function setHideToolCalls(on: boolean): void {
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* ignore */ }
  listeners.forEach(l => l())
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** 当前是否隐藏消息流中的工具调用气泡（MCP/命令/读写/子代理…）。 */
export function useHideToolCalls(): boolean {
  return useSyncExternalStore(subscribe, read, () => true)
}
