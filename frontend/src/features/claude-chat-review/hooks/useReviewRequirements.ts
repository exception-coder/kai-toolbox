import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deletePublicReviewRequirement,
  listPublicReviewRequirements,
  synchronizePublicReviewRequirements,
  updatePublicReviewRequirement,
  type PublicReviewRequirement,
  type ReviewRequirementDraft,
} from '@/features/claude-chat/public-api'

export function useReviewRequirements(token: string, detectedDrafts: ReviewRequirementDraft[]) {
  const [items, setItems] = useState<PublicReviewRequirement[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const attemptedSources = useRef(new Set<string>())

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await listPublicReviewRequirements(token))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取需求清单失败')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    attemptedSources.current = new Set()
    void reload()
  }, [reload])

  const draftKey = useMemo(
    () => detectedDrafts.map(item => item.sourceMessageId).sort().join('|'),
    [detectedDrafts],
  )

  useEffect(() => {
    if (loading || !token) return
    const existing = new Set(items.map(item => item.sourceMessageId))
    const missing = detectedDrafts.filter(draft =>
      !existing.has(draft.sourceMessageId) && !attemptedSources.current.has(draft.sourceMessageId))
    if (missing.length === 0) return
    missing.forEach(draft => attemptedSources.current.add(draft.sourceMessageId))
    setSyncing(true)
    void synchronizePublicReviewRequirements(token, missing)
      .then(setItems)
      .catch(cause => setError(cause instanceof Error ? cause.message : '同步新需求失败'))
      .finally(() => setSyncing(false))
  }, [detectedDrafts, draftKey, items, loading, token])

  const save = useCallback(async (item: PublicReviewRequirement, title: string, content: string) => {
    setBusyIds(previous => new Set(previous).add(item.id))
    setError(null)
    try {
      const updated = await updatePublicReviewRequirement(token, item.id, {
        title,
        content,
        expectedRevision: item.revision,
      })
      setItems(previous => previous.map(value => value.id === updated.id ? updated : value))
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存需求失败')
      return false
    } finally {
      setBusyIds(previous => {
        const next = new Set(previous)
        next.delete(item.id)
        return next
      })
    }
  }, [token])

  const remove = useCallback(async (item: PublicReviewRequirement) => {
    setBusyIds(previous => new Set(previous).add(item.id))
    setError(null)
    try {
      await deletePublicReviewRequirement(token, item.id)
      attemptedSources.current.add(item.sourceMessageId)
      setItems(previous => previous.filter(value => value.id !== item.id))
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除需求失败')
      return false
    } finally {
      setBusyIds(previous => {
        const next = new Set(previous)
        next.delete(item.id)
        return next
      })
    }
  }, [token])

  return { items, loading, syncing, error, busyIds, reload, save, remove }
}
