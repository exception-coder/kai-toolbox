import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getSessionRuntimeState,
  type ChatItem,
  type SessionRuntimeState,
} from '@/features/claude-chat/public-api'

const ACTIVE_RUNTIME_STATUSES = new Set<SessionRuntimeState['effectiveStatus']>([
  'RUNNING',
  'AWAITING_DECISION',
  'FINALIZING',
  'BACKGROUND_RUNNING',
])

const TERMINAL_RUNTIME_STATUSES = new Set<SessionRuntimeState['effectiveStatus']>([
  'IDLE',
  'INTERRUPTED',
])

const UNRELIABLE_RUNTIME_CONSISTENCIES = new Set<SessionRuntimeState['consistency']>([
  'BACKEND_STATE_LOST',
  'TURN_MISMATCH',
  'SIDECAR_UNREACHABLE',
  'STALE',
])

export const RUNTIME_TERMINAL_STARTUP_GRACE_MS = 30_000

export type ConsultConversationPhase =
  | 'idle'
  | 'dispatching'
  | 'running'
  | 'checking'
  | 'stoppedWithoutResponse'
  | 'runtimeUnavailable'

export interface ConsultConversationStateInput {
  items: ChatItem[]
  localRunning: boolean
  dispatching: boolean
  runtimeState?: SessionRuntimeState
  runtimePending: boolean
  runtimeError: boolean
  runtimeActiveObservedForTurn: boolean
  now: number
}

export interface ConsultConversationState {
  phase: ConsultConversationPhase
  hasUnansweredUserTurn: boolean
  waiting: boolean
}

interface UseConsultConversationRuntimeStateInput {
  sessionId: string | null
  items: ChatItem[]
  localRunning: boolean
  dispatching: boolean
}

export function hasUnansweredUserTurn(items: ChatItem[]): boolean {
  let lastUserIndex = -1
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index].kind === 'user') {
      lastUserIndex = index
      break
    }
  }
  if (lastUserIndex < 0) return false
  return !items.slice(lastUserIndex + 1).some(
    item => item.kind === 'assistant' && item.text.trim().length > 0,
  )
}

function latestUserTurn(items: ChatItem[]): Extract<ChatItem, { kind: 'user' }> | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index].kind === 'user') {
      return items[index] as Extract<ChatItem, { kind: 'user' }>
    }
  }
  return undefined
}

function runtimeSnapshotBelongsToTurn(
  runtimeState: SessionRuntimeState,
  turn: Extract<ChatItem, { kind: 'user' }> | undefined,
): boolean {
  return turn?.ts == null || runtimeState.observedAt >= turn.ts
}

/** 以共享 Runtime 为权威终态，避免浏览器漏收终态后无限等待。 */
export function deriveConsultConversationState(
  input: ConsultConversationStateInput,
): ConsultConversationState {
  const unanswered = hasUnansweredUserTurn(input.items)
  const currentTurn = latestUserTurn(input.items)

  if (input.dispatching) {
    return { phase: 'dispatching', hasUnansweredUserTurn: unanswered, waiting: true }
  }

  const runtimeStatus = input.runtimeState?.effectiveStatus
  const runtimeBelongsToCurrentTurn = input.runtimeState == null
    || runtimeSnapshotBelongsToTurn(input.runtimeState, currentTurn)
  if (unanswered && input.runtimeState && !runtimeBelongsToCurrentTurn) {
    return {
      phase: input.localRunning ? 'running' : 'checking',
      hasUnansweredUserTurn: true,
      waiting: true,
    }
  }

  const runtimeUnreliable = input.runtimeError
    || input.runtimeState?.stale === true
    || (input.runtimeState != null
      && UNRELIABLE_RUNTIME_CONSISTENCIES.has(input.runtimeState.consistency))
  if (unanswered && runtimeUnreliable) {
    return { phase: 'runtimeUnavailable', hasUnansweredUserTurn: true, waiting: false }
  }

  if (runtimeStatus && ACTIVE_RUNTIME_STATUSES.has(runtimeStatus)) {
    return { phase: 'running', hasUnansweredUserTurn: unanswered, waiting: true }
  }

  if (unanswered && runtimeStatus && TERMINAL_RUNTIME_STATUSES.has(runtimeStatus)) {
    const turnAge = currentTurn?.ts == null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, input.now - currentTurn.ts)
    if (!input.runtimeActiveObservedForTurn && turnAge < RUNTIME_TERMINAL_STARTUP_GRACE_MS) {
      return {
        phase: input.localRunning ? 'running' : 'checking',
        hasUnansweredUserTurn: true,
        waiting: true,
      }
    }
    return { phase: 'stoppedWithoutResponse', hasUnansweredUserTurn: true, waiting: false }
  }

  if (unanswered && (runtimeStatus === 'UNKNOWN' || runtimeStatus === 'RECONNECTING')) {
    return { phase: 'runtimeUnavailable', hasUnansweredUserTurn: true, waiting: false }
  }

  if (input.localRunning) {
    return { phase: 'running', hasUnansweredUserTurn: unanswered, waiting: true }
  }

  if (unanswered && (input.runtimePending || !input.runtimeState)) {
    return { phase: 'checking', hasUnansweredUserTurn: true, waiting: true }
  }

  return { phase: 'idle', hasUnansweredUserTurn: unanswered, waiting: false }
}

/** 将共享 Runtime 查询适配为业务咨询的展示状态。 */
export function useConsultConversationRuntimeState(input: UseConsultConversationRuntimeStateInput) {
  const lastItem = input.items[input.items.length - 1]
  const currentTurn = latestUserTurn(input.items)
  const [runtimeObservation, setRuntimeObservation] = useState({
    key: '',
    activeObserved: false,
  })
  const query = useQuery({
    queryKey: ['claude-chat-runtime-state', input.sessionId],
    queryFn: () => getSessionRuntimeState(input.sessionId!),
    enabled: Boolean(input.sessionId),
    refetchInterval: input.localRunning || input.dispatching || lastItem?.kind === 'user' ? 5_000 : 15_000,
    retry: 1,
  })
  const currentTurnKey = `${input.sessionId ?? ''}:${currentTurn?.id ?? ''}`
  const currentRuntimeIsActive = Boolean(query.data
    && runtimeSnapshotBelongsToTurn(query.data, currentTurn)
    && ACTIVE_RUNTIME_STATUSES.has(query.data.effectiveStatus))
  useEffect(() => {
    setRuntimeObservation(previous => {
      if (previous.key !== currentTurnKey) {
        return { key: currentTurnKey, activeObserved: currentRuntimeIsActive }
      }
      if (currentRuntimeIsActive && !previous.activeObserved) {
        return { ...previous, activeObserved: true }
      }
      return previous
    })
  }, [currentRuntimeIsActive, currentTurnKey])
  const activeObservedForCurrentTurn = runtimeObservation.key === currentTurnKey
    && runtimeObservation.activeObserved
  return {
    state: deriveConsultConversationState({
      items: input.items,
      localRunning: input.localRunning,
      dispatching: input.dispatching,
      runtimeState: query.data,
      runtimePending: query.isPending,
      runtimeError: query.isError,
      runtimeActiveObservedForTurn: activeObservedForCurrentTurn,
      now: Date.now(),
    }),
    runtimeState: query.data,
    runtimeFetching: query.isFetching,
    refetchRuntime: query.refetch,
  }
}
