import { useEffect, useState } from 'react'
import { subscribeSse } from '@/lib/api'
import type { ScanCompletedEvent, ScanProgressEvent } from '../types'

export type ScanLiveStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface ScanLiveState {
  status: ScanLiveStatus
  progress: ScanProgressEvent | null
  result: ScanCompletedEvent | null
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

    const close = subscribeSse(`/flatten/scans/${scanId}/scan-events`, {
      onEvent: (name, data) => {
        switch (name) {
          case 'progress':
            setState(s => ({ ...s, status: 'running', progress: data as ScanProgressEvent }))
            break
          case 'completed':
            setState(s => ({ ...s, status: 'completed', result: data as ScanCompletedEvent }))
            break
          case 'cancelled':
            setState(s => ({ ...s, status: 'cancelled' }))
            break
          case 'error':
            setState(s => ({
              ...s,
              status: 'failed',
              errorMsg: (data as { message?: string })?.message ?? null,
            }))
            break
        }
      },
    })

    return () => close()
  }, [scanId])

  return state
}
