import { useCallback, useEffect, useRef, useState } from 'react'
import { getDevPreference, saveDevPreference } from '@/features/_devkit/devPreferenceApi'

const STORAGE_KEY = 'kai-toolbox:project-workspace:ignored-projects'
const PREFERENCE_ID = 'project-workspace'
/** 忽略状态筛选偏好持久化 key（记住上次选择）。 */
const FILTER_KEY = 'kai-toolbox:project-workspace:ignore-filter'

interface ProjectWorkspacePreference {
  ignoredProjects: string[]
}

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
 * 「忽略项目」偏好以服务端 SQLite 为事实源，localStorage 作为离线备份和旧数据迁移来源。
 * 被忽略的项目仍正常显示/可选中，只是不参与「检测全部」批量知识图谱检测（§12 R19/R20）。
 */
export function useIgnoredProjects() {
  const [ignored, setIgnored] = useState<Set<string>>(load)
  const ignoredRef = useRef(ignored)
  const changedBeforeHydrationRef = useRef(false)
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve())

  const persist = useCallback((paths: Set<string>) => {
    const preference: ProjectWorkspacePreference = { ignoredProjects: Array.from(paths) }
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(() => saveDevPreference(PREFERENCE_ID, preference))
      .catch(error => console.error('保存隐藏项目偏好失败', error))
  }, [])

  useEffect(() => {
    let active = true
    void getDevPreference<ProjectWorkspacePreference>(PREFERENCE_ID)
      .then(preference => {
        if (!active) return
        if (changedBeforeHydrationRef.current) {
          persist(ignoredRef.current)
          return
        }
        if (Array.isArray(preference?.ignoredProjects)) {
          const serverIgnored = new Set(preference.ignoredProjects)
          ignoredRef.current = serverIgnored
          setIgnored(serverIgnored)
          return
        }
        if (ignoredRef.current.size > 0) persist(ignoredRef.current)
      })
      .catch(error => console.error('读取隐藏项目偏好失败，使用本地备份', error))
    return () => { active = false }
  }, [persist])

  useEffect(() => {
    ignoredRef.current = ignored
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
      ignoredRef.current = next
      changedBeforeHydrationRef.current = true
      persist(next)
      return next
    })
  }, [persist])

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
