import { useSyncExternalStore } from 'react'

const key = 'forge.vibecoding.recent-sessions-expanded'
const eventName = 'forge:workspace-preferences'
function read() {
  try { return localStorage.getItem(key) !== 'false' } catch { return true }
}
function subscribe(listener: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === key || event.key === null) listener() }
  window.addEventListener(eventName, listener)
  window.addEventListener('storage', storage)
  return () => { window.removeEventListener(eventName, listener); window.removeEventListener('storage', storage) }
}
export function setRecentSessionsExpanded(value: boolean) {
  localStorage.setItem(key, String(value))
  window.dispatchEvent(new Event(eventName))
}
export function useRecentSessionsExpanded() {
  return useSyncExternalStore(subscribe, read, () => true)
}

export const readingChangeEvent = 'forge:reading-preferences-before-change'
const densityKey = 'forge.vibecoding.reading-density'
const fontKey = 'forge.vibecoding.reading-font'
const densities = ['comfortable', 'standard', 'compact'] as const
export type ReadingDensity = typeof densities[number]
function readDensity(): ReadingDensity {
  try {
    const value = localStorage.getItem(densityKey)
    return densities.includes(value as ReadingDensity) ? value as ReadingDensity : 'standard'
  } catch { return 'standard' }
}
function readFont() {
  try {
    const value = Number(localStorage.getItem(fontKey))
    return [15, 16, 17].includes(value) ? value : 16
  } catch { return 16 }
}
function subscribeReading(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === null || event.key === densityKey || event.key === fontKey) listener()
  }
  window.addEventListener(eventName, listener)
  window.addEventListener('storage', storage)
  return () => { window.removeEventListener(eventName, listener); window.removeEventListener('storage', storage) }
}
function saveReading(key: string, value: string) {
  localStorage.setItem(key, value)
  // Consumers capture the current visible message before the store notification changes layout.
  window.dispatchEvent(new Event(readingChangeEvent))
  window.dispatchEvent(new Event(eventName))
}
export function setReadingDensity(value: ReadingDensity) { saveReading(densityKey, value) }
export function setReadingFont(value: number) { if ([15, 16, 17].includes(value)) saveReading(fontKey, String(value)) }
export function useReadingDensity() { return useSyncExternalStore(subscribeReading, readDensity, () => 'standard' as ReadingDensity) }
export function useReadingFont() { return useSyncExternalStore(subscribeReading, readFont, () => 16) }
