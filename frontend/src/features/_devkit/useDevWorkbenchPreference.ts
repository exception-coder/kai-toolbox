import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getDevPreference,
  saveDevPreference,
  type DevServicePreference,
  type DevWorkbenchPreference,
} from './devPreferenceApi'

interface LegacyKeys {
  cwd: string
  module: string
  requirement: string
}

function legacyValue(key: string): string {
  try { return localStorage.getItem(key) ?? '' } catch { return '' }
}

/**
 * SQLite 偏好状态：远端无记录时以旧 localStorage 为一次性迁移种子；hydration 前不允许反向保存。
 */
export function useDevWorkbenchPreference(workbenchId: string, legacy: LegacyKeys) {
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => ['dev-workbench-preference', workbenchId] as const, [workbenchId])
  const legacySeed = useMemo<DevWorkbenchPreference>(() => ({
    cwd: legacyValue(legacy.cwd),
    module: legacyValue(legacy.module),
    requirement: legacyValue(legacy.requirement),
    services: {},
  }), [legacy.cwd, legacy.module, legacy.requirement])
  const [preference, setPreference] = useState(legacySeed)
  const latestPreferenceRef = useRef(preference)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const saveTimerRef = useRef<number | null>(null)
  const pendingSaveRef = useRef<DevWorkbenchPreference | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const query = useQuery({
    queryKey,
    queryFn: () => getDevPreference(workbenchId),
    staleTime: 30_000,
  })

  const enqueueSave = useCallback((next: DevWorkbenchPreference) => {
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(() => saveDevPreference(workbenchId, next))
      .then(() => undefined)
  }, [workbenchId])

  const flushPendingSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const pending = pendingSaveRef.current
    pendingSaveRef.current = null
    if (pending) enqueueSave(pending)
  }, [enqueueSave])

  const scheduleSave = useCallback((next: DevWorkbenchPreference) => {
    pendingSaveRef.current = next
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(flushPendingSave, 350)
  }, [flushPendingSave])

  useEffect(() => {
    if (!query.isFetched || query.isError || hydrated) return
    if (query.data) {
      const restored = {
        cwd: query.data.cwd ?? '',
        module: query.data.module ?? '',
        requirement: query.data.requirement ?? '',
        services: query.data.services ?? {},
      }
      latestPreferenceRef.current = restored
      setPreference(restored)
    } else if (legacySeed.cwd || legacySeed.module || legacySeed.requirement
      || Object.keys(legacySeed.services).length > 0) {
      // 仅远端无记录时迁移一次旧偏好；普通水合与远端读取不得反向写回。
      enqueueSave(legacySeed)
    }
    setHydrated(true)
  }, [enqueueSave, hydrated, legacySeed, query.data, query.isError, query.isFetched])

  useEffect(() => {
    return () => flushPendingSave()
  }, [flushPendingSave])

  const updatePreference = (
    updater: (current: DevWorkbenchPreference) => DevWorkbenchPreference,
    immediate = false,
  ) => {
    const next = updater(latestPreferenceRef.current)
    latestPreferenceRef.current = next
    setPreference(next)
    queryClient.setQueryData(queryKey, next)
    if (immediate) {
      pendingSaveRef.current = next
      flushPendingSave()
    } else {
      scheduleSave(next)
    }
  }

  const setField = (field: 'cwd' | 'module' | 'requirement', value: string) => {
    updatePreference(current => ({ ...current, [field]: value }))
  }
  const setService = (serviceId: string, value: DevServicePreference, immediate = false) => {
    updatePreference(current => ({
      ...current,
      cwd: value.cwd || current.cwd,
      services: { ...current.services, [serviceId]: value },
    }), immediate)
  }

  return { preference, hydrated, setField, setService }
}
