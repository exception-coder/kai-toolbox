const ACTIVE_AGENT_STATES = new Set(['pendinginit', 'running'])
const TERMINAL_AGENT_STATES = new Set(['completed', 'errored', 'interrupted', 'notfound', 'shutdown'])

type ItemPhase = 'inProgress' | 'completed'

export type CodexTurnCompletionAssessment = {
  queueReleaseSafe: boolean
  finalizingRequired: boolean
  reason?: 'turnFailed' | 'subAgentStateUnconfirmed' | 'finalResponseMissing'
  activeSubAgentCount: number
}

/**
 * 判断 App Server 的主 turn 终态是否足以安全启动下一条用户消息。
 * 上游的 turn/completed 不保证子 Agent 和主 Agent 最终回复均已收口，因此这里独立维护更强的不变式。
 */
export class CodexTurnCompletionGate {
  private latestAgentStates = new Map<string, string>()
  private authoritativeSnapshotObserved = false
  private subAgentObserved = false
  private finalAssistantResponseReady = false

  observeItem(phase: ItemPhase, item: Record<string, unknown> | undefined): void {
    if (!item) return
    const itemType = stringValue(item.type)
    this.updateSubAgentState(itemType, item)

    if (itemType === 'agentMessage' && !isChildAgentMessage(item)) {
      this.finalAssistantResponseReady = phase === 'completed' && stringValue(item.status) !== 'failed'
      return
    }

    // 最终 Assistant 消息之后又出现任何工作项，说明该消息只是过程播报而不是本轮最终答复。
    if (this.isWorkItem(itemType)) this.finalAssistantResponseReady = false
  }

  assess(turnStatus: string, finalizingRecheckComplete = false): CodexTurnCompletionAssessment {
    const activeSubAgentCount = this.activeSubAgentCount()
    if (normalizeState(turnStatus) !== 'completed') {
      return { queueReleaseSafe: false, finalizingRequired: false, reason: 'turnFailed', activeSubAgentCount }
    }
    if (!this.finalAssistantResponseReady) {
      return { queueReleaseSafe: false, finalizingRequired: false, reason: 'finalResponseMissing', activeSubAgentCount }
    }

    const snapshotUnconfirmed = this.subAgentObserved
      && (!this.authoritativeSnapshotObserved || this.hasUnsettledSnapshotState())
    if (snapshotUnconfirmed && !finalizingRecheckComplete) {
      return {
        queueReleaseSafe: false,
        finalizingRequired: true,
        reason: 'subAgentStateUnconfirmed',
        activeSubAgentCount,
      }
    }
    return { queueReleaseSafe: true, finalizingRequired: false, activeSubAgentCount }
  }

  private updateSubAgentState(itemType: string, item: Record<string, unknown>): void {
    if (itemType === 'subAgentActivity') {
      this.subAgentObserved = true
      return
    }
    if (itemType !== 'collabAgentToolCall') return

    const agentStates = recordValue(item.agentsStates) ?? recordValue(item.agents_states)
    if (agentStates) {
      this.authoritativeSnapshotObserved = true
      this.latestAgentStates = new Map()
      for (const [agentId, stateValue] of Object.entries(agentStates)) {
        this.latestAgentStates.set(agentId, normalizeState(agentStateValue(stateValue)))
      }
    }

    const tool = normalizeState(stringValue(item.tool))
    const receiverIds = arrayStrings(item.receiverThreadIds ?? item.receiver_thread_ids)
    if (tool === 'spawnagent' || receiverIds.length > 0) this.subAgentObserved = true
  }

  private activeSubAgentCount(): number {
    return [...this.latestAgentStates.values()].filter(state => ACTIVE_AGENT_STATES.has(state)).length
  }

  private hasUnsettledSnapshotState(): boolean {
    return [...this.latestAgentStates.values()].some(state => !TERMINAL_AGENT_STATES.has(state))
  }

  private isWorkItem(itemType: string): boolean {
    return itemType !== '' && itemType !== 'agentMessage'
  }
}

export function codexIncompleteTurnMessage(assessment: CodexTurnCompletionAssessment): string {
  if (assessment.reason === 'finalResponseMissing') {
    return 'Codex 主轮已返回 completed，但未检测到完整的最终回复；待发送消息已保留。'
  }
  return 'Codex 本轮未正常完成；待发送消息已保留。'
}

export function codexFinalizingTurnMessage(assessment: CodexTurnCompletionAssessment): string {
  if (assessment.activeSubAgentCount > 0) {
    return `最新 agentsStates 仍有 ${assessment.activeSubAgentCount} 个活动子 Agent，正在短暂复核根线程终态。`
  }
  return '子 Agent 权威状态暂时无法确认，正在短暂复核根线程终态。'
}

function isChildAgentMessage(item: Record<string, unknown>): boolean {
  const author = stringValue(item.author)
  return author.startsWith('/root/')
}

function agentStateValue(value: unknown): string {
  if (typeof value === 'string') return value
  const state = recordValue(value)
  return stringValue(state?.status) || stringValue(state?.state) || stringValue(state?.kind)
}

function arrayStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizeState(value: string): string {
  return value.replace(/[-_\s]/g, '').toLowerCase()
}
