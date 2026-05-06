import { useEffect, useState } from 'react'
import { subscribeSse } from '@/lib/api'
import type { MoveCompletedEvent, MoveProgressEvent } from '../types'

export type MoveLiveStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface MoveLiveState {
  status: MoveLiveStatus
  progress: MoveProgressEvent | null
  result: MoveCompletedEvent | null
  errorMsg: string | null
}

const INITIAL: MoveLiveState = {
  status: 'idle',
  progress: null,
  result: null,
  errorMsg: null,
}

export function useMoveEvents(scanId: string | null, active: boolean) {
  const [state, setState] = useState<MoveLiveState>(INITIAL)

  useEffect(() => {
    if (!scanId || !active) {
      setState(INITIAL)
      return
    }
    setState({ ...INITIAL, status: 'running' })

    const close = subscribeSse(`/flatten/scans/${scanId}/move-events`, {
      onEvent: (name, data) => {
        switch (name) {
          case 'progress':
            setState(s => ({ ...s, status: 'running', progress: data as MoveProgressEvent }))
            break
          case 'completed':
            setState(s => ({ ...s, status: 'completed', result: data as MoveCompletedEvent }))
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
  }, [scanId, active])

  return state
}
