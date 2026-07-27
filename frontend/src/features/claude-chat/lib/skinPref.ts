import { useSyncExternalStore } from 'react'

/**
 * 「炫彩皮肤」开关：默认关。纯前端、localStorage 持久。
 * 用 useSyncExternalStore 而非各组件自己 useState，是为了让全屏页与悬浮窗订阅同一份开关
 * ——两者分属不同的 React 子树（悬浮窗挂在 AppShell 之外），各存一份必然会不同步。
 */
const KEY = 'kai-toolbox:claude-chat:skin'
const listeners = new Set<() => void>()

function read(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function setSkin(on: boolean): void {
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* ignore */ }
  listeners.forEach(l => l())
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** 当前是否启用炫彩皮肤。 */
export function useSkin(): boolean {
  return useSyncExternalStore(subscribe, read, () => false)
}

/**
 * 皮肤根类名。极光的主色跟随当前引擎的品牌色——背景于是携带了「现在是谁在干活」这条信息，
 * 余光扫一眼就知道，不必去读顶栏那枚小图标；running 时呼吸加快，也是同理的余光信号。
 */
export function skinClass(on: boolean, engine: string, running: boolean): string {
  if (!on) return ''
  return `cc-skin cc-skin-${engine || 'claude'}${running ? ' cc-skin-live' : ''}`
}
