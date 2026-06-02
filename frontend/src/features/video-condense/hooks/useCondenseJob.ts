import { useCallback, useEffect, useRef, useState } from 'react'
import { analyze, cancelJob, getJob, render, subscribeJob } from '../api'
import type { JobView, SegmentView } from '../types'

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * 单作业生命周期：analyze → SSE 订阅进度 → （用户微调）→ render。
 * 订阅在 analyze 时建立并贯穿到终态；ANALYZED 非终态，emitter 保持开着，render 的 RENDERING/DONE 走同一条流。
 */
export function useCondenseJob() {
  const [job, setJob] = useState<JobView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const closeRef = useRef<(() => void) | null>(null)

  const subscribe = useCallback((id: string) => {
    closeRef.current?.()
    closeRef.current = subscribeJob(id, {
      onEvent: (_name, data) => {
        const j = data as JobView
        setJob(j)
        // 终态时主动关流，否则服务端 complete 后 EventSource 会反复自动重连
        if (j.status === 'DONE' || j.status === 'FAILED' || j.status === 'CANCELLED') {
          closeRef.current?.()
          closeRef.current = null
        }
      },
    })
  }, [])

  useEffect(() => () => closeRef.current?.(), [])

  const analyzeVideo = useCallback(async (path: string) => {
    if (!path.trim()) return
    setBusy(true)
    setError(null)
    try {
      const { jobId } = await analyze(path.trim())
      subscribe(jobId)
      setJob(await getJob(jobId))
    } catch (e) {
      setError(msg(e))
    } finally {
      setBusy(false)
    }
  }, [subscribe])

  const renderVideo = useCallback(async (segments: SegmentView[], musicPath?: string) => {
    if (!job) return
    setBusy(true)
    setError(null)
    try {
      setJob(await render(job.jobId, segments, musicPath))
    } catch (e) {
      setError(msg(e))
    } finally {
      setBusy(false)
    }
  }, [job])

  const cancel = useCallback(async () => {
    if (!job) return
    try {
      setJob(await cancelJob(job.jobId))
    } catch (e) {
      setError(msg(e))
    }
  }, [job])

  const reset = useCallback(() => {
    closeRef.current?.()
    closeRef.current = null
    setJob(null)
    setError(null)
  }, [])

  return { job, error, busy, analyzeVideo, renderVideo, cancel, reset }
}
