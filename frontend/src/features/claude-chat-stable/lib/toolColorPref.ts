import { useSyncExternalStore } from 'react'

/** 「工具调用着色」开关：默认关（关=当前默认中性样式）。纯前端、localStorage 持久、跨气泡实时同步。 */
const KEY = 'kai-toolbox:claude-chat-stable:tool-colors'
const listeners = new Set<() => void>()

function read(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function setToolColors(on: boolean): void {
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* ignore */ }
  listeners.forEach(l => l())
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** 当前是否启用工具着色。 */
export function useToolColors(): boolean {
  return useSyncExternalStore(subscribe, read, () => false)
}
