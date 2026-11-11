import type { ChatItem, ServerMessage } from '../types'

type ActivityItem = Extract<ChatItem, { kind: 'activity' }>
type ToolActivityMessage = Extract<ServerMessage, { type: 'toolActivity' }>
type TurnActivityMessage = Extract<ServerMessage, { type: 'turnActivity' }>
type CodexActivityMessage = Extract<ServerMessage, { type: 'codexActivity' }>
type EngineEventMessage = Extract<ServerMessage, { type: 'engineEvent' }>

/*
 * 运行活动卡片（工具 / 轮次 / Codex / 子 Agent / 引擎连接）的纯更新函数。
 * 从 useClaudeChatSocket 的事件分发中拆出，行为与原实现一致。
 */

/** 这些状态表示仍在执行，收到时需要先确认轮次处于运行中。 */
export function isRunningActivity(status: string): boolean {
  return status === 'inProgress' || status === 'in_progress' || status === 'running'
    || status === 'pending' || status === 'started'
}

/** 子 Agent 快照里的总数与仍在运行（pending/running）的数量。 */
export function engineSubagentSummary(payload: Record<string, unknown>): { total: number; running: number } {
  const agents = Array.isArray(payload.agents) ? payload.agents : []
  const running = agents.filter(agent => {
    if (!agent || typeof agent !== 'object') return false
    const state = (agent as Record<string, unknown>).state
    return state === 'pending' || state === 'running'
  }).length
  return { total: agents.length, running }
}

/** 按 id 原位替换，不存在时追加到末尾。 */
function upsertById(items: ChatItem[], next: ActivityItem): ChatItem[] {
  const index = items.findIndex(item => item.id === next.id)
  if (index < 0) return [...items, next]
  const copy = items.slice()
  copy[index] = next
  return copy
}

/** 本轮最近几条里可被后续成功调用标记为“已自动重试”的命令语法 / 转义失败。 */
function findRecoverableCommandFailure(items: ChatItem[], toolName: string): number {
  const minimum = Math.max(0, items.length - 6)
  for (let index = items.length - 1; index >= minimum; index -= 1) {
    const item = items[index]
    if (item.kind === 'result' || item.kind === 'user') break
    if (item.kind !== 'activity' || !['shellSyntax', 'argumentEscaping'].includes(item.outcome ?? '')) continue
    const data = item.data && typeof item.data === 'object' && !Array.isArray(item.data)
      ? item.data as Record<string, unknown>
      : undefined
    if (!data?.toolName || data.toolName === toolName) return index
  }
  return -1
}

/** 工具活动：成功时把同工具最近的语法失败标为已自动重试；按调用 id 更新并保留首次时间。 */
export function applyToolActivity(prev: ChatItem[], msg: ToolActivityMessage, now = Date.now()): ChatItem[] {
  const id = `tool-activity-${msg.toolCallId || msg.seq}`
  let base = prev
  if (msg.outcome === 'success') {
    const retryIndex = findRecoverableCommandFailure(prev, msg.toolName)
    if (retryIndex >= 0) {
      base = prev.slice()
      const failed = base[retryIndex]
      if (failed.kind === 'activity') {
        base[retryIndex] = {
          ...failed,
          title: `已自动重试 · ${failed.title}`,
          outcome: 'recovered',
          severity: 'info',
        }
      }
    }
  }
  const previous = base.find(item => item.id === id)
  return upsertById(base, {
    kind: 'activity',
    id,
    activityType: 'tool',
    status: msg.status,
    title: msg.title,
    detail: msg.detail,
    outcome: msg.outcome,
    severity: msg.severity,
    data: { elapsedMs: msg.elapsedMs, output: msg.outputTail, toolName: msg.toolName },
    ts: previous?.ts ?? now,
  })
}

/** 轮次活动：始终只保留一张当前轮次卡片。 */
export function applyTurnActivity(prev: ChatItem[], msg: TurnActivityMessage, now = Date.now()): ChatItem[] {
  return upsertById(prev, {
    kind: 'activity',
    id: 'turn-activity-current',
    activityType: 'turn',
    status: msg.status,
    title: msg.title,
    detail: msg.detail,
    data: { elapsedMs: msg.elapsedMs, phase: msg.phase },
    ts: now,
  })
}

/** Codex 活动：按活动类型与条目 id 更新。 */
export function applyCodexActivity(prev: ChatItem[], msg: CodexActivityMessage, now = Date.now()): ChatItem[] {
  return upsertById(prev, {
    kind: 'activity', id: `codex-activity-${msg.activityType}-${msg.itemId || msg.seq}`, activityType: msg.activityType,
    status: msg.status, title: msg.title, detail: msg.detail, data: msg.data, ts: now,
  })
}

/** 子 Agent 快照：每轮一张卡片，展示运行中 / 已收口数量。 */
export function applySubagentSnapshot(prev: ChatItem[], msg: EngineEventMessage,
  summary: { total: number; running: number }): ChatItem[] {
  return upsertById(prev, {
    kind: 'activity',
    id: `engine-subagents-${msg.turnId}`,
    activityType: 'subagent',
    status: summary.running > 0 ? 'inProgress' : 'completed',
    title: summary.running > 0
      ? `${msg.engine} 子 Agent 作业中 · ${summary.running}/${summary.total}`
      : `${msg.engine} 子 Agent 已收口 · ${summary.total}`,
    data: msg.payload,
    ts: msg.observedAt,
  })
}

/** 引擎连接事件：每次追加一条连接状态卡片。 */
export function engineConnectionItem(msg: EngineEventMessage): ActivityItem {
  const transport = typeof msg.payload.transport === 'string' ? msg.payload.transport : 'unknown'
  return {
    kind: 'activity', id: `engine-connection-${msg.eventId}`, activityType: 'connection',
    status: transport === 'connected' ? 'completed' : 'inProgress',
    title: transport === 'connected' ? `${msg.engine} 已连接` : `${msg.engine} ${transport}`,
    data: msg.payload, ts: msg.observedAt,
  }
}
