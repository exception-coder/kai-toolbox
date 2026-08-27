import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { Dispatch, SetStateAction } from 'react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { getSession as getPrdSession, type PrdSessionView } from '@/features/prd-clarify/public-api'
import { analyzeItem, assignItem, deleteItem, deleteItems, startClarify, updateItem } from '../api'
import type { AgentEngine, ReqItemView } from '../types'
import type { ReqpoolActions } from './useReqpoolActions'

/** 需求条目的分析、分派、日期、选择和删除命令。 */
export function useReqpoolItemCommands({
  items,
  selected,
  setSelected,
  visibleIds,
  allVisibleSelected,
  sessionsById,
  actions,
  closeQuickEntry,
}: {
  items: ReqItemView[]
  selected: ReqItemView | null
  setSelected: Dispatch<SetStateAction<ReqItemView | null>>
  visibleIds: string[]
  allVisibleSelected: boolean
  sessionsById: Map<string, PrdSessionView>
  actions: ReqpoolActions
  closeQuickEntry: () => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const {
    showNotice,
    setAnalyzingId,
    setAssigningId,
    setDeadlineSavingId,
    setQuestionPrd,
    setSelectedIds,
    selectedIds,
    setBulkDeleteError,
    setBulkDeleting,
  } = actions

  const analyze = async (item: ReqItemView, engine: AgentEngine): Promise<void> => {
    setAnalyzingId(item.id)
    try {
      const updated = await analyzeItem(item.id, engine)
      setSelected(updated)
      await queryClient.invalidateQueries({ queryKey: ['reqpool'] })
    } finally {
      setAnalyzingId(null)
    }
  }

  const clarify = async (item: ReqItemView): Promise<void> => {
    await startClarify(item.id)
    const params = new URLSearchParams({
      title: item.title,
      rawInput: item.description ?? '',
      project: item.project ?? '',
      module: item.module ?? '',
      reqItemId: item.id,
    })
    navigate(`/tools/prd-clarify?${params.toString()}`)
  }

  const openPrdQuestions = async (item: ReqItemView): Promise<void> => {
    if (!item.prdSessionId) return
    const session = sessionsById.get(item.prdSessionId) ?? await getPrdSession(item.prdSessionId)
    if (session.questions.length === 0) {
      showNotice('澄清问题仍在构建中，请稍候', 2_200)
      return
    }
    setQuestionPrd({ item, session })
  }

  const remove = async (item: ReqItemView): Promise<void> => {
    const accepted = await confirm({
      title: '删除当前需求',
      description: item.prdSessionId
        ? `确认删除“${item.title}”？仅删除需求中枢记录，关联 PRD 仍会保留。`
        : `确认删除“${item.title}”？此操作不可撤销。`,
      confirmText: '确认删除',
      variant: 'destructive',
    })
    if (!accepted) return
    await deleteItem(item.id)
    setSelectedIds(current => withoutValue(current, item.id))
    setSelected(null)
    await queryClient.invalidateQueries({ queryKey: ['reqpool'] })
  }

  const toggleSelected = (id: string): void => {
    setBulkDeleteError('')
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleVisible = (): void => {
    setBulkDeleteError('')
    setSelectedIds(current => {
      const next = new Set(current)
      if (allVisibleSelected) visibleIds.forEach(id => next.delete(id))
      else visibleIds.forEach(id => next.add(id))
      return next
    })
  }

  const removeSelected = async (): Promise<void> => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    const linkedCount = items.filter(item => selectedIds.has(item.id) && item.prdSessionId).length
    const accepted = await confirm({
      title: `批量删除 ${ids.length} 条需求`,
      description: linkedCount > 0
        ? `其中 ${linkedCount} 条关联了 PRD。删除只会移除需求中枢记录，关联 PRD 仍会保留；其余记录删除后不可恢复。`
        : '删除后不可恢复，请确认所选需求无需继续保留。',
      confirmText: `确认删除 ${ids.length} 条`,
      variant: 'destructive',
    })
    if (!accepted) return
    setBulkDeleteError('')
    setBulkDeleting(true)
    try {
      await deleteItems(ids)
      if (selected && selectedIds.has(selected.id)) setSelected(null)
      setSelectedIds(new Set())
      await queryClient.invalidateQueries({ queryKey: ['reqpool'] })
    } catch (cause) {
      setBulkDeleteError(cause instanceof Error ? cause.message : '批量删除失败，请稍后重试')
    } finally {
      setBulkDeleting(false)
    }
  }

  const quickSaved = async (title: string): Promise<void> => {
    closeQuickEntry()
    showNotice(`“${title}”已保存为需求草稿`, 2_400)
    await queryClient.invalidateQueries({ queryKey: ['reqpool'] })
  }

  const assign = async (itemId: string, userId: number | null): Promise<void> => {
    setAssigningId(itemId)
    try {
      updateCachedItem(queryClient, await assignItem(itemId, userId), setSelected)
    } finally {
      setAssigningId(null)
    }
  }

  const saveDeadline = async (itemId: string, deadline: string): Promise<void> => {
    setDeadlineSavingId(itemId)
    try {
      updateCachedItem(queryClient, await updateItem(itemId, { deadline }), setSelected)
    } finally {
      setDeadlineSavingId(null)
    }
  }

  return { analyze, clarify, openPrdQuestions, remove, toggleSelected, toggleVisible, removeSelected, quickSaved, assign, saveDeadline }
}

function withoutValue(values: Set<string>, value: string): Set<string> {
  if (!values.has(value)) return values
  const next = new Set(values)
  next.delete(value)
  return next
}

function updateCachedItem(
  queryClient: ReturnType<typeof useQueryClient>,
  updated: ReqItemView,
  setSelected: Dispatch<SetStateAction<ReqItemView | null>>,
): void {
  queryClient.setQueryData<ReqItemView[]>(['reqpool'], current =>
    current?.map(item => item.id === updated.id ? updated : item) ?? [updated])
  setSelected(current => current?.id === updated.id ? updated : current)
}
