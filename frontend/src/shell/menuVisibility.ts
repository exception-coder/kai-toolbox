import { useMemo, useSyncExternalStore } from 'react'
import type { FeatureManifest } from './types'

/**
 * 菜单软隐藏：管理员在「菜单配置」里勾掉的模块 id 集合，存本地（localStorage）。
 *
 * 与 manifest.hidden 的代码级隐藏区分：
 *  - 代码级隐藏（featureRegistry 已剔除）——路由都不注册，只能改源码恢复。
 *  - 这里的软隐藏——仅隐藏侧边栏/首页入口，路由仍在（直达 URL 可用），勾回来即时恢复，无需重建。
 *
 * 本工具箱是单用户本地应用：菜单偏好属 UI 层，落 localStorage 即可（也契合「菜单不依赖后端、后端挂了照常工作」）。
 * 用模块级单例 + useSyncExternalStore，让侧边栏 / 首页 / 配置页共享同一份状态、勾选即时联动，并跨标签页同步。
 */
const STORAGE_KEY = 'kai-toolbox:menu-hidden-ids'

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const arr: unknown = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

let hiddenIds = read()
let snapshot: readonly string[] = Object.freeze([...hiddenIds])
const listeners = new Set<() => void>()

function emit() {
  snapshot = Object.freeze([...hiddenIds])
  listeners.forEach((l) => l())
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...hiddenIds]))
  } catch {
    // 隐私模式/配额异常忽略：至少本次会话内的内存态仍生效。
  }
}

// 跨标签页同步：另一个标签改了偏好，本标签同步刷新（storage 事件只在其它标签触发）。
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      hiddenIds = read()
      emit()
    }
  })
}

/** 设置某模块的软隐藏状态。hidden=true 隐藏菜单入口，false 恢复显示。 */
export function setMenuHidden(id: string, hidden: boolean) {
  if (hidden === hiddenIds.has(id)) return
  if (hidden) hiddenIds.add(id)
  else hiddenIds.delete(id)
  persist()
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getSnapshot() {
  return snapshot
}

/** 当前被软隐藏的模块 id（响应式，随勾选即时更新）。 */
export function useHiddenMenuIds(): readonly string[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** 过滤掉被软隐藏的模块，供侧边栏 / 首页渲染可见菜单。 */
export function useVisibleFeatures(all: FeatureManifest[]): FeatureManifest[] {
  const hidden = useHiddenMenuIds()
  return useMemo(() => {
    const set = new Set(hidden)
    return all.filter((f) => !set.has(f.id))
  }, [all, hidden])
}
