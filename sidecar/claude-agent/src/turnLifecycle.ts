import { randomUUID } from 'node:crypto'

export type InterruptOutcome = 'accepted' | 'alreadyStopped' | 'turnMismatch'

export interface InterruptSnapshot {
  outcome: InterruptOutcome
  active: boolean
  pendingDecision: boolean
  activeTurnId?: string
}

interface ActiveTurn {
  id: string
  terminal: boolean
  interrupted: boolean
  hadError: boolean
}

/**
 * 单个 Sidecar 会话的轮次终态门禁。
 * 为所有引擎补齐 turnId，并保证 error/result 乱序或重复时只产生一个终态。
 */
export class TurnLifecycle {
  private active?: ActiveTurn

  begin(requestedTurnId?: string): { accepted: boolean; turnId: string; blockingTurnId?: string } {
    const turnId = requestedTurnId?.trim() || randomUUID()
    if (this.active) {
      return { accepted: false, turnId, blockingTurnId: this.active.id }
    }
    this.active = { id: turnId, terminal: false, interrupted: false, hadError: false }
    return { accepted: true, turnId }
  }

  decorate(event: Record<string, unknown>): Record<string, unknown> | null {
    const turn = this.active
    if (!turn) return event
    const type = typeof event.type === 'string' ? event.type : ''
    if (type === 'error') turn.hadError = true
    if (type === 'result') {
      if (turn.terminal) return null
      turn.terminal = true
    }
    return { ...event, turnId: turn.id }
  }

  requestInterrupt(expectedTurnId: string | undefined, pendingDecision: boolean): InterruptSnapshot {
    const turn = this.active
    if (!turn || turn.terminal) {
      return { outcome: 'alreadyStopped', active: false, pendingDecision }
    }
    if (expectedTurnId?.trim() && expectedTurnId !== turn.id) {
      return {
        outcome: 'turnMismatch',
        active: true,
        pendingDecision,
        activeTurnId: turn.id,
      }
    }
    turn.interrupted = true
    return {
      outcome: 'accepted',
      active: true,
      pendingDecision,
      activeTurnId: turn.id,
    }
  }

  snapshot(expectedTurnId?: string): InterruptSnapshot {
    const turn = this.active
    if (!turn || turn.terminal) {
      return { outcome: 'alreadyStopped', active: false, pendingDecision: false }
    }
    if (expectedTurnId?.trim() && expectedTurnId !== turn.id) {
      return { outcome: 'turnMismatch', active: true, pendingDecision: false, activeTurnId: turn.id }
    }
    return { outcome: 'accepted', active: true, pendingDecision: false, activeTurnId: turn.id }
  }

  fallbackStopReason(): 'interrupted' | 'error' | 'end_turn' {
    if (this.active?.interrupted) return 'interrupted'
    if (this.active?.hadError) return 'error'
    return 'end_turn'
  }

  currentTurnId(): string | undefined {
    return this.active?.id
  }

  terminal(): boolean {
    return this.active?.terminal ?? true
  }

  finish(turnId: string): void {
    if (this.active?.id === turnId) this.active = undefined
  }
}
