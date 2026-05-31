// 通用工具级配置存储 client + hook
//
// 后端：toolbox-common 的 /api/feature-configs/{featureId}，单表 KV
// 用法：feature 自己定义 schema 类型 T 和 defaults，hook 返回浅合并后的 config
//
// 设计文档：ai-docs/kai-toolbox/design/feature-config-通用配置存储/

import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, http } from './api'

export interface FeatureConfigView<T> {
  featureId: string
  value: T
  updatedAt: number
}

/** 库内 404 时，是否从 localStorage 该 key 读旧值迁移上库 */
export interface LegacyMigrationOptions {
  /** 旧 localStorage 键名 */
  key: string
  /** 把 localStorage 原始字符串还原为业务对象；返回 null 表示放弃迁移 */
  parse?: (raw: string) => unknown
}

export interface UseFeatureConfigOptions<T> {
  defaults: T
  /** 仅 object 类型有用：浅合并 defaults ⊕ remote。默认 true */
  shallowMerge?: boolean
  legacy?: LegacyMigrationOptions
}

// ── 纯 HTTP client（组件外也能用） ────────────────────────────────────

/** 库内不存在返回 null（不抛），其他错误原样抛 */
export async function getFeatureConfig<T>(featureId: string): Promise<FeatureConfigView<T> | null> {
  try {
    return await http<FeatureConfigView<T>>(`/feature-configs/${encodeURIComponent(featureId)}`)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

export function putFeatureConfig<T>(featureId: string, value: T): Promise<FeatureConfigView<T>> {
  return http<FeatureConfigView<T>>(`/feature-configs/${encodeURIComponent(featureId)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  })
}

export function deleteFeatureConfig(featureId: string): Promise<void> {
  return http<void>(`/feature-configs/${encodeURIComponent(featureId)}`, { method: 'DELETE' })
}

// ── React hook ────────────────────────────────────────────────────────

const queryKeyOf = (featureId: string) => ['feature-config', featureId] as const

/**
 * 订阅某 featureId 的配置。
 * - 首次进入：拉取后端；若 404 且配置了 legacy，则尝试从 localStorage 迁移上库
 * - config 永远不为 undefined：未拉到时返回 defaults
 * - setConfig：PUT 后内存缓存即时更新，无需 invalidate
 * - resetConfig：DELETE 后回落 defaults
 */
export function useFeatureConfig<T extends object>(
  featureId: string,
  opts: UseFeatureConfigOptions<T>,
) {
  const { defaults, shallowMerge = true, legacy } = opts
  const queryClient = useQueryClient()

  const query = useQuery<FeatureConfigView<T> | null, Error>({
    queryKey: queryKeyOf(featureId),
    // 配置变更基本只发生在自己操作时；不需要窗口聚焦自动刷新
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    queryFn: async () => {
      const existing = await getFeatureConfig<T>(featureId)
      if (existing) return existing
      // 库内无记录：尝试 localStorage → 库的一次性迁移
      if (legacy) {
        const migrated = await tryMigrateFromLegacy<T>(featureId, legacy)
        if (migrated) return migrated
      }
      return null
    },
  })

  const config = useMemo<T>(() => {
    const remote = query.data?.value
    if (!remote) return defaults
    return shallowMerge ? { ...defaults, ...remote } : remote
    // defaults 引用变化会触发，调用方应当 useMemo defaults 或用稳定字面量
  }, [query.data, defaults, shallowMerge])

  const setMutation = useMutation<FeatureConfigView<T>, Error, T>({
    mutationFn: next => putFeatureConfig<T>(featureId, next),
    onSuccess: view => {
      queryClient.setQueryData(queryKeyOf(featureId), view)
    },
  })

  const resetMutation = useMutation<void, Error, void>({
    mutationFn: () => deleteFeatureConfig(featureId),
    onSuccess: () => {
      queryClient.setQueryData(queryKeyOf(featureId), null)
    },
  })

  const setConfig = useCallback(async (next: T) => {
    await setMutation.mutateAsync(next)
  }, [setMutation])

  const resetConfig = useCallback(async () => {
    await resetMutation.mutateAsync()
  }, [resetMutation])

  return {
    config,
    isReady: !query.isPending,
    isLoading: query.isPending,
    isSaving: setMutation.isPending || resetMutation.isPending,
    error: query.error ?? setMutation.error ?? resetMutation.error ?? null,
    setConfig,
    resetConfig,
    updatedAt: query.data?.updatedAt ?? null,
  }
}

// ── 内部 ──────────────────────────────────────────────────────────────

async function tryMigrateFromLegacy<T>(
  featureId: string,
  legacy: LegacyMigrationOptions,
): Promise<FeatureConfigView<T> | null> {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(legacy.key)
  } catch {
    return null
  }
  if (raw == null) return null

  let value: unknown
  try {
    value = legacy.parse ? legacy.parse(raw) : JSON.parse(raw)
  } catch {
    return null
  }
  if (value == null || typeof value !== 'object') return null

  try {
    const view = await putFeatureConfig<T>(featureId, value as T)
    // 迁移成功才清掉旧 key；失败保留以便用户重试
    try { window.localStorage.removeItem(legacy.key) } catch { /* ignore */ }
    return view
  } catch {
    return null
  }
}
