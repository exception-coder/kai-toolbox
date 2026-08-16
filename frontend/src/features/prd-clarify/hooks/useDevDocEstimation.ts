import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { estimateDevDocEffort, getSession } from '../api'
import type { DevDocEstimation } from '../types'

interface UseDevDocEstimationOptions {
  sessionId: string
  initialEstimation?: DevDocEstimation | null
  initialProgressPath?: string | null
  initialProgressGeneratedAt?: number | null
}

/** 管理开发文档工时与进度评估的异步状态。 */
export function useDevDocEstimation({
  sessionId,
  initialEstimation,
  initialProgressPath,
  initialProgressGeneratedAt,
}: UseDevDocEstimationOptions) {
  const queryClient = useQueryClient()
  const [estimation, setEstimation] = useState<DevDocEstimation | null>(initialEstimation ?? null)
  const [estimateDialogOpen, setEstimateDialogOpen] = useState(false)
  const [estimating, setEstimating] = useState(false)
  const [estimateError, setEstimateError] = useState<string | null>(null)
  const [estimationDetailOpen, setEstimationDetailOpen] = useState(false)
  const [progressPath, setProgressPath] = useState<string | null>(initialProgressPath ?? null)
  const [progressGeneratedAt, setProgressGeneratedAt] = useState<number | null>(initialProgressGeneratedAt ?? null)
  const [progressDialogOpen, setProgressDialogOpen] = useState(false)
  const [progressHistoryOpen, setProgressHistoryOpen] = useState(false)
  const [progressVersion, setProgressVersion] = useState<{ version: number; isCurrent: boolean } | null>(null)

  useEffect(() => {
    if (estimation?.workStatus !== 'RUNNING') return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const latest = await getSession(sessionId)
        if (cancelled) return
        setEstimation(latest.devDocEstimation)
        if (latest.devDocEstimation?.workStatus === 'RUNNING') timer = setTimeout(poll, 2_000)
        else void queryClient.invalidateQueries({ queryKey: ['prd-sessions'] })
      } catch {
        if (!cancelled) timer = setTimeout(poll, 4_000)
      }
    }
    timer = setTimeout(poll, 1_200)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [estimation?.workStatus, queryClient, sessionId])

  const estimateEffort = async (extraContext: string) => {
    setEstimating(true)
    setEstimateError(null)
    try {
      const updated = await estimateDevDocEffort(sessionId, extraContext || undefined)
      setEstimation(updated.devDocEstimation)
      setEstimateDialogOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['prd-sessions'] })
    } catch (error) {
      setEstimateError(error instanceof Error ? error.message : '工时评估失败，请重试')
    } finally {
      setEstimating(false)
    }
  }

  const markProgressEvaluated = () => {
    setProgressPath(`${sessionId}-progress`)
    setProgressGeneratedAt(Date.now())
    void queryClient.invalidateQueries({ queryKey: ['prd-sessions'] })
  }

  const closeEstimateDialog = () => {
    if (estimating) return
    setEstimateDialogOpen(false)
    setEstimateError(null)
  }

  return {
    estimation,
    estimateDialogOpen,
    setEstimateDialogOpen,
    estimating,
    estimateError,
    estimationDetailOpen,
    setEstimationDetailOpen,
    progressPath,
    progressGeneratedAt,
    progressDialogOpen,
    setProgressDialogOpen,
    progressHistoryOpen,
    setProgressHistoryOpen,
    progressVersion,
    setProgressVersion,
    estimateEffort,
    markProgressEvaluated,
    closeEstimateDialog,
  }
}
