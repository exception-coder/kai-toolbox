import { useEffect, useState } from 'react'
import { openRecordingStream } from '../api'
import type { HttpCallStreamView, RecordingStatus } from '../types'

export interface RecordingStreamState {
  calls: HttpCallStreamView[]
  terminated: boolean
  stoppedReason?: string
  stoppedStatus?: RecordingStatus
  callCount: number
  error: string | null
}

/**
 * 订阅指定 recordingId 的 SSE 流。每条 call 累积到 calls 数组，stopped 事件标记 terminated。
 * recordingId 为 null 时不订阅（用于在没有 active 录制时挂载组件）。
 */
export function useRecordingStream(recordingId: string | null): RecordingStreamState {
  const [state, setState] = useState<RecordingStreamState>({
    calls: [], terminated: false, callCount: 0, error: null,
  })

  useEffect(() => {
    if (!recordingId) {
      setState({ calls: [], terminated: false, callCount: 0, error: null })
      return
    }
    setState({ calls: [], terminated: false, callCount: 0, error: null })
    const close = openRecordingStream(recordingId, {
      // backfill 一次性塞入订阅前已经入库的 calls，按 id 去重 + 按 seq 排序
      onBackfill: views => setState(s => {
        const existing = new Set(s.calls.map(c => c.id))
        const fresh = views.filter(v => !existing.has(v.id))
        if (fresh.length === 0) return s
        const merged = [...s.calls, ...fresh].sort((a, b) => a.seq - b.seq)
        return { ...s, calls: merged, callCount: merged.length }
      }),
      // 实时 call 也按 id 去重（防止 backfill 和实时事件有交叠）
      onCall: view => setState(s => {
        if (s.calls.some(c => c.id === view.id)) return s
        return {
          ...s,
          calls: [...s.calls, view],
          callCount: s.callCount + 1,
        }
      }),
      onStopped: payload => setState(s => ({
        ...s,
        terminated: true,
        stoppedReason: payload.reason,
        stoppedStatus: payload.status as RecordingStatus,
        callCount: payload.callCount,
      })),
      onError: () => setState(s => ({ ...s, error: '事件流断开（自动重连）' })),
    })
    return close
  }, [recordingId])

  return state
}
