const STORAGE_KEY = 'toolbox.mockMode'

type Listener = (enabled: boolean) => void
const listeners = new Set<Listener>()

let enabled = readInitial()

function readInitial(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function isMockEnabled(): boolean {
  return enabled
}

export function setMockEnabled(next: boolean): void {
  if (enabled === next) return
  enabled = next
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
  } catch {
    // ignore quota / privacy errors
  }
  for (const l of listeners) l(next)
}

export function onMockToggle(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
