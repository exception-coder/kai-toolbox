import { useSyncExternalStore } from 'react'

/** 「隐藏工具调用」开关：默认关（关=当前默认行为，工具调用气泡照常显示）。纯前端、localStorage 持久、跨气泡实时同步。 */
const KEY = 'kai-toolbox:claude-chat:hide-tool-calls'
const listeners = new Set<() => void>()

function read(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
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
  return useSyncExternalStore(subscribe, read, () => false)
}
