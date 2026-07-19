import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { refreshStatusCache, statusCache } from '@/features/knowledge-graph/api'
import type { GraphifyGraphState, ProjectStatusSnapshot, RegistrationState } from '@/features/knowledge-graph/types'

export type GraphifyFilter = 'ALL' | 'UNCHECKED' | GraphifyGraphState
export type BusinessFilter = 'ALL' | 'UNCHECKED' | RegistrationState

const CACHE_KEY = ['kg-status-cache']

/** 筛选偏好持久化 key（记住上次选择，跨刷新/进出页面不重置）。 */
const GRAPHIFY_FILTER_LS = 'kai-toolbox:project-workspace:graphify-filter'
const BUSINESS_FILTER_LS = 'kai-toolbox:project-workspace:business-filter'

function loadPref<T extends string>(key: string, fallback: T): T {
  try { return (localStorage.getItem(key) as T) || fallback } catch { return fallback }
}
function savePref(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* 隐私模式忽略 */ }
}

/**
 * 项目工作台左侧项目列表的跨项目状态筛选：懒加载缓存 + 手动「检测全部」批量刷新。
 * 两个筛选维度独立取值，AND 关系；"未检测"是与三个已知态并列的第四态（§11.4 R18），不归入 NOT_REGISTERED。
 */
export function useStatusCache() {
  const qc = useQueryClient()
  const cacheQ = useQuery({ queryKey: CACHE_KEY, queryFn: statusCache, staleTime: 60_000 })
  const refreshMut = useMutation({
    mutationFn: (paths: string[]) => refreshStatusCache(paths),
    onSuccess: (partial) => {
      qc.setQueryData<Record<string, ProjectStatusSnapshot>>(CACHE_KEY, (prev) => ({ ...(prev ?? {}), ...partial }))
    },
  })

  const [graphifyFilter, setGraphifyFilter] = useState<GraphifyFilter>(() => loadPref(GRAPHIFY_FILTER_LS, 'ALL'))
  const [businessFilter, setBusinessFilter] = useState<BusinessFilter>(() => loadPref(BUSINESS_FILTER_LS, 'ALL'))
  useEffect(() => { savePref(GRAPHIFY_FILTER_LS, graphifyFilter) }, [graphifyFilter])
  useEffect(() => { savePref(BUSINESS_FILTER_LS, businessFilter) }, [businessFilter])

  const cache = cacheQ.data ?? {}
  const matches = useMemo(() => {
    return (path: string) => {
      const snap = cache[path]
      if (graphifyFilter !== 'ALL') {
        if (graphifyFilter === 'UNCHECKED') {
          if (snap?.graphifyState != null) return false
        } else if (snap?.graphifyState !== graphifyFilter) {
          return false
        }
      }
      if (businessFilter !== 'ALL') {
        if (businessFilter === 'UNCHECKED') {
          if (snap?.businessGraphState != null) return false
        } else if (snap?.businessGraphState !== businessFilter) {
          return false
        }
      }
      return true
    }
  }, [cache, graphifyFilter, businessFilter])

  return {
    cache,
    isLoading: cacheQ.isLoading,
    snapshotOf: (path: string) => cache[path],
    refresh: (paths: string[]) => refreshMut.mutate(paths),
    refreshing: refreshMut.isPending,
    refreshError: refreshMut.isError ? (refreshMut.error as Error).message : null,
    graphifyFilter,
    setGraphifyFilter,
    businessFilter,
    setBusinessFilter,
    isFilterActive: graphifyFilter !== 'ALL' || businessFilter !== 'ALL',
    matches,
  }
}
