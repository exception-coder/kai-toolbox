import { useEffect, useRef, useState } from 'react'
import { downloaderApi } from '../services/downloaderApi'
import type { ProgressEvent, SegmentEvent, StateEvent, TaskState } from '../types'

export interface LiveTaskSnapshot {
  taskId: number
  downloaded: number
  total: number
  rateBps: number
  etaSeconds: number | null
  state: TaskState | null
  routeType: 'DIRECT' | 'PROXY' | null
  routeProxy: string | null
  lastError: string | null
  /** 最近一次 segment 事件，用于在卡片里做轻量动效 */
  lastSegmentSeqNo: number | null
}

/**
 * 订阅单个任务的 SSE 事件流，把 progress / state / segment 三路事件折叠成一份 LiveTaskSnapshot。
 * 不主动拉取初始 detail；调用方应在挂载时先用 react-query 拉一次保证即时填充。
 */
export function useTaskSse(taskId: number | null, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<LiveTaskSnapshot | null>(null)
  const closeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    closeRef.current?.()
    closeRef.current = null
    if (!enabled || taskId == null) return
    setSnapshot(prev => prev?.taskId === taskId ? prev : null)

    const close = downloaderApi.subscribeEvents(taskId, {
      onEvent: (name, data) => {
        if (name === 'progress') {
          const p = data as ProgressEvent
          setSnapshot(prev => ({
            taskId: p.taskId,
            downloaded: p.downloaded,
            total: p.total,
            rateBps: p.rateBps,
            etaSeconds: p.etaSeconds,
            state: prev?.state ?? null,
            routeType: prev?.routeType ?? null,
            routeProxy: prev?.routeProxy ?? null,
            lastError: prev?.lastError ?? null,
            lastSegmentSeqNo: prev?.lastSegmentSeqNo ?? null,
          }))
        } else if (name === 'state') {
          const s = data as StateEvent
          setSnapshot(prev => ({
            taskId: s.taskId,
            downloaded: prev?.downloaded ?? 0,
            total: prev?.total ?? -1,
            rateBps: prev?.rateBps ?? 0,
            etaSeconds: prev?.etaSeconds ?? null,
            state: s.state,
            routeType: s.routeType,
            routeProxy: s.routeProxy,
            lastError: s.error,
            lastSegmentSeqNo: prev?.lastSegmentSeqNo ?? null,
          }))
        } else if (name === 'segment') {
          const e = data as SegmentEvent
          setSnapshot(prev => prev ? { ...prev, lastSegmentSeqNo: e.seqNo } : prev)
        }
      },
    })
    closeRef.current = close
    return () => {
      close()
      closeRef.current = null
    }
  }, [taskId, enabled])

  return snapshot
}
