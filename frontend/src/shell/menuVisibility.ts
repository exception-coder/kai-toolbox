import { useMemo, useSyncExternalStore } from 'react'
import type { FeatureManifest } from './types'

/**
 * 菜单可见性：默认只展示「当前在用」的核心模块，其余默认隐藏（仍可在「菜单配置」勾选显示，或 Ctrl+K 命令面板直达）。
 *
 * 模型 = 可见白名单：
 *  - 未定制（localStorage 无记录）→ 用 DEFAULT_VISIBLE_IDS（核心集）。这样新加的模块默认也不进菜单，避免侧栏越堆越长。
 *  - 用户在「菜单配置」勾选后 → 持久化其完整可见集，之后以它为准。
 *  - 「菜单配置」自身始终可见（兜底，避免勾没了就再也进不去）。
 *
 * 与 manifest.hidden 的代码级隐藏区分：那是整体剔除（连路由都不注册）；这里只隐藏侧栏/首页入口，路由仍在。
 * 单用户本地应用，偏好落 localStorage（也契合「菜单不依赖后端」）。用 useSyncExternalStore 让各处共享、即时联动、跨标签页同步。
 */
export const DEFAULT_VISIBLE_IDS: readonly string[] = [
  // AI / Vibe Coding 工作台核心
  'claude-chat',
  'project-workspace',
  'erp-dev',
  'srm-dev',
  'kai-dev',
  'new-devmodule',
  // 系统
  'config-center',
  'ops',
  'menu-settings',
]

/** 无论如何都保持可见的模块（防止用户把「菜单配置」自己勾掉后无法再进入）。 */
const ALWAYS_VISIBLE = 'menu-settings'

const STORAGE_KEY = 'kai-toolbox:menu-visible-ids'

function readStored(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const arr: unknown = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : null
  } catch {
    return null
  }
}

/** 当前生效的可见集合（未定制走核心默认；始终含菜单配置）。 */
function computeEffective(): Set<string> {
  const stored = readStored()
  const base = stored ?? DEFAULT_VISIBLE_IDS
  const s = new Set(base)
  s.add(ALWAYS_VISIBLE)
  return s
}

let effective = computeEffective()
let snapshot: readonly string[] = Object.freeze([...effective].sort())
const listeners = new Set<() => void>()

function emit() {
  effective = computeEffective()
  snapshot = Object.freeze([...effective].sort())
  listeners.forEach((l) => l())
}

function persist(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // 隐私模式/配额异常忽略：本次会话内内存态仍生效。
  }
}

// 跨标签页同步。
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) emit()
  })
}

/** 设置某模块是否在菜单显示。菜单配置自身不可隐藏。 */
export function setMenuVisible(id: string, visible: boolean) {
  const next = new Set(effective)
  if (visible) next.add(id)
  else if (id !== ALWAYS_VISIBLE) next.delete(id)
  next.add(ALWAYS_VISIBLE)
  persist(next)
  emit()
}

/** 批量设置（如「全部显示」）。 */
export function setManyVisible(ids: string[], visible: boolean) {
  const next = new Set(effective)
  for (const id of ids) {
    if (visible) next.add(id)
    else if (id !== ALWAYS_VISIBLE) next.delete(id)
  }
  next.add(ALWAYS_VISIBLE)
  persist(next)
  emit()
}

/** 恢复默认（只显示核心集）。 */
export function resetMenuVisibility() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getSnapshot() {
  return snapshot
}

/** 当前可见模块 id（响应式）。 */
export function useVisibleIds(): readonly string[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** 当前可见模块 id 集合（响应式，供菜单配置渲染勾选态）。 */
export function useMenuVisibleSet(): ReadonlySet<string> {
  const ids = useVisibleIds()
  return useMemo(() => new Set(ids), [ids])
}

/** 过滤出应在菜单显示的模块，供侧栏 / 首页渲染。 */
export function useVisibleFeatures(all: FeatureManifest[]): FeatureManifest[] {
  const set = useMenuVisibleSet()
  return useMemo(() => all.filter((f) => set.has(f.id)), [all, set])
}
