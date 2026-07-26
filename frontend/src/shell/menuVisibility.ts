import { useEffect, useMemo } from 'react'
import { useSyncExternalStore } from 'react'
import { http } from '@/lib/api'
import { getUser, useAuth } from '@/lib/auth'
import { features } from './featureRegistry'
import type { FeatureManifest } from './types'

/**
 * 菜单可见性：默认展示「分配给当前用户」的全部模块，用户可在「菜单配置」里手动隐藏（软隐藏，路由仍在）。
 *
 * 模型 = 可见白名单：
 *  - 未定制 → 用 DEFAULT_VISIBLE_IDS（= 全部已注册功能菜单）。侧栏/首页会再按账号权限（menu:<id>）过滤，
 *    故「分配给该用户的菜单默认即展示」，无需逐个勾选。
 *  - 用户在「菜单配置」手动隐藏后 → 持久化其完整可见集（白名单），之后以它为准。
 *  - 「菜单配置」自身始终可见（兜底，避免勾没了就再也进不去）。
 *
 * 持久化（按登录用户存后端）：
 *  - 已登录 → 落后端 `/api/menu-visibility`（关联当前登录用户，多设备同步）；localStorage 仅作缓存 + 兜底。
 *  - 登录后 hydrate：拉后端；库内无记录且本地有配置 → 首次迁移上云；否则用默认集（全部已授权模块）。
 *  - 未登录 / 接口失败 → 回退 localStorage + 默认集，不阻塞进入。
 *
 * 与 manifest.hidden 的代码级隐藏区分：那是整体剔除（连路由都不注册）；这里只隐藏侧栏/首页入口，路由仍在。
 * 用 useSyncExternalStore 让各处共享、即时联动、跨标签页同步。
 */
export const DEFAULT_VISIBLE_IDS: readonly string[] = features
  .filter((f) => !f.chrome) // chrome（管理页）不进功能菜单；manifest.hidden 已在注册表层剔除
  .map((f) => f.id)

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

// ── 后端持久化（按登录用户） ──────────────────────────────────────────
//
// 后端：toolbox-common 的 /api/menu-visibility（GET/PUT/DELETE，@RequireAuth，userId 取自登录态）。

interface MenuVisibilityDto {
  visibleIds: string[] | null // null = 库内无记录（未定制）
  updatedAt: number | null
}

/** 拉当前用户的可见集；未登录/失败返回 null（由调用方走本地兜底）。 */
async function fetchServer(): Promise<MenuVisibilityDto | null> {
  try {
    return await http<MenuVisibilityDto>('/menu-visibility')
  } catch {
    return null
  }
}

/** best-effort 保存到后端；失败静默（本地已乐观更新，下次操作会再同步）。 */
function pushServer(ids: string[]) {
  void http('/menu-visibility', {
    method: 'PUT',
    body: JSON.stringify({ visibleIds: ids }),
  }).catch(() => {})
}

/** best-effort 恢复默认（删除后端记录）。 */
function deleteServer() {
  void http('/menu-visibility', { method: 'DELETE' }).catch(() => {})
}

let hydratedUserId: number | null = null

/**
 * 登录后把该用户的可见集从后端拉下来（或首次迁移本地配置上云）。
 * - 库内有记录 → 以它为准，镜像回 localStorage 缓存。
 * - 库内无记录 + 本地有配置 → 首次迁移：上云，保持本地现状。
 * - 库内无记录 + 本地也无 → 用默认核心集（computeEffective 已兜底），不改动。
 */
async function hydrateForUser(userId: number) {
  const dto = await fetchServer()
  // 竞态保护：await 期间用户可能已切换/登出。
  if (getUser()?.userId !== userId) return
  if (dto && dto.visibleIds) {
    const ids = new Set(dto.visibleIds)
    ids.add(ALWAYS_VISIBLE)
    persist(ids)
    emit()
  } else {
    const local = readStored()
    if (local && local.length) {
      const migrated = new Set(local)
      migrated.add(ALWAYS_VISIBLE)
      pushServer([...migrated]) // 首次迁移上云；本地已是有效值，无需重算
    }
    // 无本地记录：保持默认核心集。
  }
  hydratedUserId = userId
}

/** 设置某模块是否在菜单显示。菜单配置自身不可隐藏。 */
export function setMenuVisible(id: string, visible: boolean) {
  const next = new Set(effective)
  if (visible) next.add(id)
  else if (id !== ALWAYS_VISIBLE) next.delete(id)
  next.add(ALWAYS_VISIBLE)
  persist(next)
  emit()
  if (getUser()) pushServer([...next])
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
  if (getUser()) pushServer([...next])
}

/** 恢复默认（只显示核心集）。 */
export function resetMenuVisibility() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  emit()
  if (getUser()) deleteServer()
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

/**
 * 登录态 → 菜单可见集的同步钩子：在应用外壳挂一次即可。
 * 登录/切换用户时从后端 hydrate；登出时复位，回落 localStorage + 默认集。
 */
export function useMenuVisibilitySync() {
  const { user } = useAuth()
  const userId = user?.userId ?? null
  useEffect(() => {
    if (userId == null) {
      hydratedUserId = null
      return
    }
    if (hydratedUserId === userId) return
    void hydrateForUser(userId)
  }, [userId])
}
