import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  const legacySeed = useMemo<DevWorkbenchPreference>(() => ({
    cwd: legacyValue(legacy.cwd),
    module: legacyValue(legacy.module),
    requirement: legacyValue(legacy.requirement),
    services: {},
  }), [legacy.cwd, legacy.module, legacy.requirement])
  const [preference, setPreference] = useState(legacySeed)
  const [hydrated, setHydrated] = useState(false)
  const query = useQuery({
    queryKey: ['dev-workbench-preference', workbenchId],
    queryFn: () => getDevPreference(workbenchId),
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!query.isFetched || query.isError || hydrated) return
    if (query.data) {
      setPreference({
        cwd: query.data.cwd ?? '',
        module: query.data.module ?? '',
        requirement: query.data.requirement ?? '',
        services: query.data.services ?? {},
      })
    }
    setHydrated(true)
  }, [hydrated, query.data, query.isError, query.isFetched])

  useEffect(() => {
    if (!hydrated) return
    const timer = window.setTimeout(() => {
      saveDevPreference(workbenchId, preference).catch(() => {})
    }, 350)
    return () => window.clearTimeout(timer)
  }, [hydrated, preference, workbenchId])

  const setField = (field: 'cwd' | 'module' | 'requirement', value: string) => {
    setPreference(current => ({ ...current, [field]: value }))
  }
  const setService = (serviceId: string, value: DevServicePreference) => {
    setPreference(current => ({
      ...current,
      services: { ...current.services, [serviceId]: value },
    }))
  }

  return { preference, hydrated, setField, setService }
}
