const ACTIVE_AGENT_STATES = new Set(['active', 'inprogress', 'pending', 'running', 'started', 'working'])
const TERMINAL_AGENT_STATES = new Set([
  'cancelled', 'canceled', 'complete', 'completed', 'done', 'error', 'errored', 'failed', 'finished', 'interrupted',
  'notfound', 'shutdown', 'stopped', 'terminated',
])

type ItemPhase = 'inProgress' | 'completed'

export type CodexTurnCompletionAssessment = {
  queueReleaseSafe: boolean
  reason?: 'turnFailed' | 'subAgentsActive' | 'finalResponseMissing'
  activeSubAgentCount: number
}

/**
 * 判断 App Server 的主 turn 终态是否足以安全启动下一条用户消息。
 * 上游的 turn/completed 不保证子 Agent 和主 Agent 最终回复均已收口，因此这里独立维护更强的不变式。
 */
export class CodexTurnCompletionGate {
  private readonly activeSubAgentIds = new Set<string>()
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

  assess(turnStatus: string): CodexTurnCompletionAssessment {
    if (normalizeState(turnStatus) !== 'completed') {
      return { queueReleaseSafe: false, reason: 'turnFailed', activeSubAgentCount: this.activeSubAgentIds.size }
    }
    if (this.activeSubAgentIds.size > 0) {
      return {
        queueReleaseSafe: false,
        reason: 'subAgentsActive',
        activeSubAgentCount: this.activeSubAgentIds.size,
      }
    }
    if (!this.finalAssistantResponseReady) {
      return { queueReleaseSafe: false, reason: 'finalResponseMissing', activeSubAgentCount: 0 }
    }
    return { queueReleaseSafe: true, activeSubAgentCount: 0 }
  }

  private updateSubAgentState(itemType: string, item: Record<string, unknown>): void {
    if (itemType === 'subAgentActivity') {
      const agentId = stringValue(item.agentThreadId) || stringValue(item.agent_thread_id)
      this.applyAgentState(agentId, stringValue(item.kind) || stringValue(item.status))
      return
    }
    if (itemType !== 'collabAgentToolCall') return

    const agentStates = recordValue(item.agentsStates) ?? recordValue(item.agents_states)
    if (agentStates) {
      for (const [agentId, stateValue] of Object.entries(agentStates)) {
        this.applyAgentState(agentId, agentStateValue(stateValue))
      }
    }

    const tool = normalizeState(stringValue(item.tool))
    const receiverIds = arrayStrings(item.receiverThreadIds ?? item.receiver_thread_ids)
    if (tool === 'spawnagent') {
      for (const agentId of receiverIds) {
        if (!agentStates || !(agentId in agentStates)) this.activeSubAgentIds.add(agentId)
      }
    }
  }

  private applyAgentState(agentId: string, rawState: string): void {
    if (!agentId) return
    const state = normalizeState(rawState)
    if (TERMINAL_AGENT_STATES.has(state)) {
      this.activeSubAgentIds.delete(agentId)
    } else if (ACTIVE_AGENT_STATES.has(state)) {
      this.activeSubAgentIds.add(agentId)
    }
  }

  private isWorkItem(itemType: string): boolean {
    return itemType !== '' && itemType !== 'agentMessage'
  }
}

export function codexIncompleteTurnMessage(assessment: CodexTurnCompletionAssessment): string {
  if (assessment.reason === 'subAgentsActive') {
    return `Codex 主轮已返回 completed，但仍有 ${assessment.activeSubAgentCount} 个子 Agent 未收口；待发送消息已保留。`
  }
  if (assessment.reason === 'finalResponseMissing') {
    return 'Codex 主轮已返回 completed，但未检测到完整的最终回复；待发送消息已保留。'
  }
  return 'Codex 本轮未正常完成；待发送消息已保留。'
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
