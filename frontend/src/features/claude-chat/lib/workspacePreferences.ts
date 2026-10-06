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
