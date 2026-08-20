import type { ChatItem } from '../types'

export type TurnRunningState = {
  running: boolean
  terminal: boolean
}

export type TurnRunningSignal =
  | 'localStart'
  | 'serverRunning'
  | 'turnStarted'
  | 'runtimeEvidence'
  | 'terminal'

export const TERMINAL_TURN_RUNNING_STATE: TurnRunningState = {
  running: false,
  terminal: true,
}

export function reduceTurnRunningState(
  state: TurnRunningState,
  signal: TurnRunningSignal,
): TurnRunningState {
  if (signal === 'terminal') return TERMINAL_TURN_RUNNING_STATE
  if (signal === 'runtimeEvidence') {
    return state.terminal ? state : { running: true, terminal: false }
  }
  return { running: true, terminal: false }
}

export function finalizeRunningActivities(items: ChatItem[], reason: string): ChatItem[] {
  let changed = false
  const finalized = items.map(item => {
    if (item.kind !== 'activity' || !isRunningActivityStatus(item.status)) return item
    changed = true
    return {
      ...item,
      status: 'failed',
      outcome: item.outcome ?? 'processFailure',
      severity: item.severity ?? 'warning',
      detail: [item.detail, reason].filter(Boolean).join('；'),
    }
  })
  return changed ? finalized : items
}

function isRunningActivityStatus(status: string): boolean {
  return status === 'inProgress' || status === 'in_progress' || status === 'running'
    || status === 'pending' || status === 'started'
}
