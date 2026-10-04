/** A browser-local hint only. The server still validates access when switching sessions. */
const KEY_PREFIX = 'kai-toolbox:claude-chat:recent-session:'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const keyFor = (userId: number) => `${KEY_PREFIX}${userId}`

export function readRecentSessionHint(userId: number): string | null {
  try {
    const value = JSON.parse(localStorage.getItem(keyFor(userId)) ?? 'null') as { id?: unknown; savedAt?: unknown } | null
    if (!value || typeof value.id !== 'string' || !value.id || typeof value.savedAt !== 'number'
      || value.savedAt > Date.now() || Date.now() - value.savedAt > MAX_AGE_MS) return null
    return value.id
  } catch { return null }
}

export function saveRecentSessionHint(userId: number, id: string): void {
  try { localStorage.setItem(keyFor(userId), JSON.stringify({ id, savedAt: Date.now() })) } catch { /* storage unavailable */ }
}

export function clearRecentSessionHint(userId: number): void {
  try { localStorage.removeItem(keyFor(userId)) } catch { /* storage unavailable */ }
}
