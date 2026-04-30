import { useEffect, useState } from 'react'
import { subscribeSse } from '@/lib/api'
import type { CompletedEvent, ProgressEvent } from '../types'

export type ScanLiveStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'failed'

export interface ScanLiveState {
  status: ScanLiveStatus
  progress: ProgressEvent | null
  result: CompletedEvent | null
  errorMsg: string | null
}

const INITIAL: ScanLiveState = {
  status: 'idle',
  progress: null,
  result: null,
  errorMsg: null,
}

export function useScanEvents(scanId: string | null) {
  const [state, setState] = useState<ScanLiveState>(INITIAL)

  useEffect(() => {
    if (!scanId) {
      setState(INITIAL)
      return
    }
    setState({ ...INITIAL, status: 'running' })

    const close = subscribeSse(`/treesize/scans/${scanId}/events`, {
      onEvent: (name, data) => {
        switch (name) {
          case 'progress':
            setState(s => ({ ...s, status: 'running', progress: data as ProgressEvent }))
            break
          case 'completed':
            setState(s => ({ ...s, status: 'completed', result: data as CompletedEvent }))
            break
          case 'cancelled':
            setState(s => ({ ...s, status: 'cancelled' }))
            break
          case 'error':
            setState(s => ({
              ...s,
              status: 'failed',
              errorMsg: (data as { message?: string })?.message ?? '未知错误',
            }))
            break
        }
      },
      onError: () => {
        // SSE auto-closes when scan ends; only treat as failure if still running
        setState(s => (s.status === 'running' ? s : s))
      },
    })

    return () => close()
  }, [scanId])

  return state
}
