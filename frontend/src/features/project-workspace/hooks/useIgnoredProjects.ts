import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'kai-toolbox:project-workspace:ignored-projects'
/** 忽略状态筛选偏好持久化 key（记住上次选择）。 */
const FILTER_KEY = 'kai-toolbox:project-workspace:ignore-filter'

export type IgnoreFilter = 'ALL' | 'IGNORED' | 'NOT_IGNORED'

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr as string[]) : new Set()
  } catch {
    return new Set()
  }
}

/**
 * 「忽略项目」偏好，持久化在 localStorage（与 useAggregationCart 同一存储模式）。
 * 被忽略的项目仍正常显示/可选中，只是不参与「检测全部」批量知识图谱检测（§12 R19/R20）。
 */
export function useIgnoredProjects() {
  const [ignored, setIgnored] = useState<Set<string>>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ignored)))
    } catch {
      // 忽略隐私模式/配额异常
    }
  }, [ignored])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setIgnored(load())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const isIgnored = useCallback((path: string) => ignored.has(path), [ignored])

  const toggle = useCallback((path: string) => {
    setIgnored((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const [filter, setFilter] = useState<IgnoreFilter>(() => {
    try { return (localStorage.getItem(FILTER_KEY) as IgnoreFilter) || 'ALL' } catch { return 'ALL' }
  })
  useEffect(() => {
    try { localStorage.setItem(FILTER_KEY, filter) } catch { /* 隐私模式忽略 */ }
  }, [filter])
  const matches = useCallback((path: string) => {
    if (filter === 'ALL') return true
    return filter === 'IGNORED' ? ignored.has(path) : !ignored.has(path)
  }, [filter, ignored])

  return { isIgnored, toggle, ignoredCount: ignored.size, filter, setFilter, matches }
}
