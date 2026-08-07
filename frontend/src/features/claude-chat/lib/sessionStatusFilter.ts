import { useSyncExternalStore } from 'react'
import type { ClaudeChatSessionView } from '../types'

export type SessionVisibilityStatus = 'running' | 'available' | 'plan-expired'

export const SESSION_STATUS_OPTIONS: ReadonlyArray<{ value: SessionVisibilityStatus; label: string }> = [
  { value: 'running', label: '进行中' },
  { value: 'available', label: '可继续' },
  { value: 'plan-expired', label: '规划已过期' },
]

export const DEFAULT_SESSION_STATUSES: SessionVisibilityStatus[] = ['running', 'available']

const STORAGE_KEY = 'kai-toolbox:claude-chat:visible-session-statuses'
const VALID_STATUSES = new Set<SessionVisibilityStatus>(SESSION_STATUS_OPTIONS.map(option => option.value))
const listeners = new Set<() => void>()

function loadStatuses(): SessionVisibilityStatus[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!Array.isArray(stored)) return [...DEFAULT_SESSION_STATUSES]
    const valid = stored.filter((value): value is SessionVisibilityStatus => VALID_STATUSES.has(value))
    return valid.length > 0 ? [...new Set(valid)] : [...DEFAULT_SESSION_STATUSES]
  } catch {
    return [...DEFAULT_SESSION_STATUSES]
  }
}

let currentStatuses = typeof window === 'undefined' ? [...DEFAULT_SESSION_STATUSES] : loadStatuses()

function notify() {
  listeners.forEach(listener => listener())
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return
    currentStatuses = loadStatuses()
    notify()
  })
}

export function setVisibleSessionStatuses(statuses: SessionVisibilityStatus[]) {
  const valid = [...new Set(statuses.filter(status => VALID_STATUSES.has(status)))]
  currentStatuses = valid.length > 0 ? valid : [...DEFAULT_SESSION_STATUSES]
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(currentStatuses)) } catch { /* ignore */ }
  notify()
}

export function resetVisibleSessionStatuses() {
  setVisibleSessionStatuses([...DEFAULT_SESSION_STATUSES])
}

export function useVisibleSessionStatuses() {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => currentStatuses,
    () => DEFAULT_SESSION_STATUSES,
  )
}

export function sessionVisibilityStatus(session: ClaudeChatSessionView): SessionVisibilityStatus {
  if (session.planExpired) return 'plan-expired'
  if (session.status === 'RUNNING' && session.live) return 'running'
  return 'available'
}

export function isSessionStatusVisible(session: ClaudeChatSessionView, statuses: readonly SessionVisibilityStatus[]) {
  return statuses.includes(sessionVisibilityStatus(session))
}

