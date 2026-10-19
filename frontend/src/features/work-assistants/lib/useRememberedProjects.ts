import { useState } from 'react'
import { useAuth } from '@/lib/auth'

function readSelection(key: string | null): string[] {
  if (!key) return []
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null') as unknown
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string' && id.length <= 500).slice(0, 5) : []
  } catch { return [] }
}

/** Only project identifiers persist, scoped to the signed-in account and assistant. */
export function useRememberedProjects(scope: 'weekly' | 'resources', availableIds: string[]) {
  const { user } = useAuth()
  const key = user ? `forge:work-assistants:projects:${user.userId}:${scope}:v1` : null
  const [selection, setSelection] = useState(() => ({ key, ids: readSelection(key) }))
  // A changed account must never render the previous account's selection, even for one frame.
  const stored = selection.key === key ? selection.ids : readSelection(key)
  const limit = scope === 'weekly' ? 5 : 1
  const ids = [...new Set(stored)].filter(id => availableIds.includes(id)).slice(0, limit)
  const remember = (next: string[]) => {
    const valid = [...new Set(next)].filter(id => availableIds.includes(id)).slice(0, limit)
    setSelection({ key, ids: valid })
    if (key) try { localStorage.setItem(key, JSON.stringify(valid)) } catch { /* Keep this mounted form usable when storage is disabled. */ }
  }
  return [ids, remember] as const
}
