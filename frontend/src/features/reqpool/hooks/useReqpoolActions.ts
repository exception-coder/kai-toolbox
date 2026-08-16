import { useState } from 'react'
import type { DeliveryRequirement } from '@/features/delivery-center/public-api'
import type { PrdSessionView } from '@/features/prd-clarify/public-api'
import type { ReqItemView } from '../types'

/** 集中持有需求池异步动作和文档弹层状态，页面仅负责编排用例。 */
export function useReqpoolActions() {
  const [notice, setNotice] = useState('')
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [deadlineSavingId, setDeadlineSavingId] = useState<string | null>(null)
  const [clarifyingPrdIds, setClarifyingPrdIds] = useState<Set<string>>(() => new Set())
  const [generatingPrdIds, setGeneratingPrdIds] = useState<Set<string>>(() => new Set())
  const [buildingTddQuestionIds, setBuildingTddQuestionIds] = useState<Set<string>>(() => new Set())
  const [generatingTddIds, setGeneratingTddIds] = useState<Set<string>>(() => new Set())
  const [failedTddIds, setFailedTddIds] = useState<Set<string>>(() => new Set())
  const [questionPrd, setQuestionPrd] = useState<{ item: ReqItemView; session: PrdSessionView } | null>(null)
  const [previewPrd, setPreviewPrd] = useState<ReqItemView | null>(null)
  const [tddWork, setTddWork] = useState<DeliveryRequirement | null>(null)
  const [previewTdd, setPreviewTdd] = useState<ReqItemView | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bulkDeleteError, setBulkDeleteError] = useState('')
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const showNotice = (message: string, durationMs = 3_200) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), durationMs)
  }

  return {
    notice,
    setNotice,
    showNotice,
    analyzingId,
    setAnalyzingId,
    assigningId,
    setAssigningId,
    deadlineSavingId,
    setDeadlineSavingId,
    clarifyingPrdIds,
    setClarifyingPrdIds,
    generatingPrdIds,
    setGeneratingPrdIds,
    buildingTddQuestionIds,
    setBuildingTddQuestionIds,
    generatingTddIds,
    setGeneratingTddIds,
    failedTddIds,
    setFailedTddIds,
    questionPrd,
    setQuestionPrd,
    previewPrd,
    setPreviewPrd,
    tddWork,
    setTddWork,
    previewTdd,
    setPreviewTdd,
    selectedIds,
    setSelectedIds,
    bulkDeleteError,
    setBulkDeleteError,
    bulkDeleting,
    setBulkDeleting,
  }
}

export type ReqpoolActions = ReturnType<typeof useReqpoolActions>
