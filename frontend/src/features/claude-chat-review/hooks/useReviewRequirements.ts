import { useCallback, useEffect, useRef, useState } from 'react'
import {
  confirmPublicReviewRequirement, deletePublicReviewRequirement, getPublicReviewBacklog,
  mergePublicReviewRequirements, synchronizePublicReviewRequirements, updatePublicReviewRequirement,
  type PublicReviewRequirement, type ReviewRequirementDraft,
} from '@/features/claude-chat/public-api'
import { parseRequirementContent, writeRequirementContent } from '../lib/requirementContent'

/** 候选不会自动写入；每个写动作均来自清单里的明确操作。 */
export function useReviewRequirements(token: string, drafts: ReviewRequirementDraft[]) {
  const [items, setItems] = useState<PublicReviewRequirement[]>([])
  const [processed, setProcessed] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const scope = useRef(token)
  scope.current = token
  const inFlight = useRef(false)
  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getPublicReviewBacklog(token)
      if (scope.current === token) { setItems(result.items); setProcessed(result.processedSources); setError(null) }
    } catch (cause) { if (scope.current === token) setError(cause instanceof Error ? cause.message : '读取清单失败，可重试') }
    finally { if (scope.current === token) setLoading(false) }
  }, [token])
  useEffect(() => { setItems([]); setProcessed([]); setError(null); void reload() }, [reload])
  const run = async (action: () => Promise<void>) => {
    if (inFlight.current) return false
    inFlight.current = true; setBusy(true); setError(null)
    try { await action(); return scope.current === token }
    catch (cause) { if (scope.current === token) setError(cause instanceof Error ? cause.message : '操作失败，原内容已保留'); return false }
    finally { inFlight.current = false; if (scope.current === token) setBusy(false) }
  }
  const add = (draft: ReviewRequirementDraft) => run(async () => {
    const content = writeRequirementContent(parseRequirementContent(draft.content, draft.sourceText))
    const result = await synchronizePublicReviewRequirements(token, [{ ...draft, content }])
    if (scope.current === token) { setItems(result); setProcessed(previous => [...previous, draft.sourceMessageId]) }
  })
  const save = (item: PublicReviewRequirement, title: string, content: string) => run(async () => {
    const result = await updatePublicReviewRequirement(token, item.id, { title, content, expectedRevision: item.revision })
    if (scope.current === token) setItems(previous => previous.map(value => value.id === result.id ? result : value))
  })
  const confirm = (item: PublicReviewRequirement, confirmed: boolean) => run(async () => {
    const result = await confirmPublicReviewRequirement(token, item, confirmed)
    if (scope.current === token) setItems(previous => previous.map(value => value.id === result.id ? result : value))
  })
  const remove = (item: PublicReviewRequirement) => run(async () => {
    await deletePublicReviewRequirement(token, item.id)
    if (scope.current === token) setItems(previous => previous.filter(value => value.id !== item.id))
  })
  const merge = (target: PublicReviewRequirement, source: PublicReviewRequirement, title: string, content: string) => run(async () => {
    const result = await mergePublicReviewRequirements(token, target, source, title, content)
    if (scope.current === token) setItems(result)
  })
  const sources = new Set([...processed, ...items.flatMap(item => [item.sourceMessageId, ...(item.sources ?? []).map(source => source.sourceMessageId)])])
  return { items, candidates: drafts.filter(item => !sources.has(item.sourceMessageId)), loading, error, busy, reload, add, save, confirm, remove, merge }
}
