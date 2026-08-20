import { isMcpToolEvent } from './mcpToolWatchdog.js'

export interface ToolExecutionWatchdogEntry {
  toolCallId: string
  toolName: string
  startedAt: number
  lastActivityAt: number
  lastTurnActivityAt: number
  idleTimeoutMs: number
  maxDurationMs: number
  timeoutReason?: 'idle' | 'maxDuration'
  lastTitle?: string
  lastDetail?: string
}

interface ActiveToolExecution extends ToolExecutionWatchdogEntry {
  idleDeadline: NodeJS.Timeout
  hardDeadline: NodeJS.Timeout
  heartbeat: NodeJS.Timeout
}

interface ToolExecutionWatchdogOptions {
  idleTimeoutMs?: number
  maxDurationMs?: number
  heartbeatMs?: number
  onHeartbeat: (entry: ToolExecutionWatchdogEntry) => void
  onTimeout: (entry: ToolExecutionWatchdogEntry) => void
}

const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60_000
const DEFAULT_MAX_DURATION_MS = 60 * 60_000
const DEFAULT_HEARTBEAT_MS = 10_000
const MIN_DURATION_MS = 5_000
const MAX_DURATION_MS = 6 * 60 * 60_000

/** Bounds non-MCP tool execution without treating local UI heartbeats as upstream progress. */
export class ToolExecutionWatchdog {
  private readonly active = new Map<string, ActiveToolExecution>()
  private readonly idleTimeoutMs: number
  private readonly maxDurationMs: number
  private readonly heartbeatMs: number

  constructor(private readonly options: ToolExecutionWatchdogOptions) {
    this.idleTimeoutMs = positiveDuration(options.idleTimeoutMs, DEFAULT_IDLE_TIMEOUT_MS)
    this.maxDurationMs = positiveDuration(options.maxDurationMs, DEFAULT_MAX_DURATION_MS)
    this.heartbeatMs = positiveDuration(options.heartbeatMs, DEFAULT_HEARTBEAT_MS)
  }

  observe(event: Record<string, unknown>): void {
    if (event.watchdogGenerated === true) return
    const type = stringValue(event.type)
    const toolCallId = stringValue(event.toolCallId)
    this.touchTurnActivity()

    if (type === 'toolUse' && toolCallId && isTrackedTool(event)) {
      this.start(toolCallId, stringValue(event.toolName) || 'tool')
      return
    }
    if (type === 'toolActivity' && toolCallId && event.status === 'inProgress') {
      this.touch(toolCallId, event)
      return
    }
    if (type === 'toolResult' && toolCallId) {
      this.finish(toolCallId)
      return
    }
    if (type === 'result') this.clear()
  }

  clear(): void {
    for (const tool of this.active.values()) this.clearTimers(tool)
    this.active.clear()
  }

  private start(toolCallId: string, toolName: string): void {
    this.finish(toolCallId)
    const now = Date.now()
    const entry: ToolExecutionWatchdogEntry = {
      toolCallId,
      toolName,
      startedAt: now,
      lastActivityAt: now,
      lastTurnActivityAt: now,
      idleTimeoutMs: this.idleTimeoutMs,
      maxDurationMs: this.maxDurationMs,
    }
    const tool: ActiveToolExecution = {
      ...entry,
      idleDeadline: this.scheduleIdleDeadline(entry),
      hardDeadline: this.scheduleHardDeadline(entry),
      heartbeat: setInterval(() => {
        const current = this.active.get(toolCallId)
        if (current) this.options.onHeartbeat(this.snapshot(current))
      }, this.heartbeatMs),
    }
    tool.idleDeadline.unref?.()
    tool.hardDeadline.unref?.()
    tool.heartbeat.unref?.()
    this.active.set(toolCallId, tool)
  }

  private touch(toolCallId: string, event: Record<string, unknown>): void {
    const tool = this.active.get(toolCallId)
    if (!tool) return
    tool.lastActivityAt = Date.now()
    tool.lastTitle = stringValue(event.title) || tool.lastTitle
    tool.lastDetail = stringValue(event.detail) || tool.lastDetail
    clearTimeout(tool.idleDeadline)
    tool.idleDeadline = this.scheduleIdleDeadline(tool)
    tool.idleDeadline.unref?.()
  }

  /**
   * A silent command can still be healthy while the agent polls a yielded job, emits assistant
   * progress, or runs another verification tool. Only kill a tool when both the tool itself and
   * the whole upstream turn have been silent for the idle window.
   */
  private touchTurnActivity(): void {
    const now = Date.now()
    for (const tool of this.active.values()) {
      tool.lastTurnActivityAt = now
      clearTimeout(tool.idleDeadline)
      tool.idleDeadline = this.scheduleIdleDeadline(tool)
      tool.idleDeadline.unref?.()
    }
  }

  private finish(toolCallId: string): void {
    const tool = this.active.get(toolCallId)
    if (!tool) return
    this.clearTimers(tool)
    this.active.delete(toolCallId)
  }

  private scheduleIdleDeadline(entry: ToolExecutionWatchdogEntry): NodeJS.Timeout {
    return setTimeout(() => this.timeout(entry.toolCallId, 'idle'), this.idleTimeoutMs)
  }

  private scheduleHardDeadline(entry: ToolExecutionWatchdogEntry): NodeJS.Timeout {
    return setTimeout(() => this.timeout(entry.toolCallId, 'maxDuration'), this.maxDurationMs)
  }

  private timeout(toolCallId: string, reason: ToolExecutionWatchdogEntry['timeoutReason']): void {
    const tool = this.active.get(toolCallId)
    if (!tool) return
    this.clearTimers(tool)
    this.active.delete(toolCallId)
    this.options.onTimeout(this.snapshot(tool, reason))
  }

  private clearTimers(tool: ActiveToolExecution): void {
    clearTimeout(tool.idleDeadline)
    clearTimeout(tool.hardDeadline)
    clearInterval(tool.heartbeat)
  }

  private snapshot(
    tool: ToolExecutionWatchdogEntry,
    timeoutReason?: ToolExecutionWatchdogEntry['timeoutReason'],
  ): ToolExecutionWatchdogEntry {
    return {
      toolCallId: tool.toolCallId,
      toolName: tool.toolName,
      startedAt: tool.startedAt,
      lastActivityAt: tool.lastActivityAt,
      lastTurnActivityAt: tool.lastTurnActivityAt,
      idleTimeoutMs: tool.idleTimeoutMs,
      maxDurationMs: tool.maxDurationMs,
      timeoutReason,
      lastTitle: tool.lastTitle,
      lastDetail: tool.lastDetail,
    }
  }
}

export class ToolExecutionTimeoutAbort extends Error {
  constructor(readonly entry: ToolExecutionWatchdogEntry) {
    super(`Tool execution timed out: ${entry.toolName}`)
    this.name = 'ToolExecutionTimeoutAbort'
  }
}

export function isToolExecutionTimeoutAbort(reason: unknown): reason is ToolExecutionTimeoutAbort {
  return reason instanceof ToolExecutionTimeoutAbort
}

export function configuredToolExecutionIdleTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return boundedDuration(configuredNumber(env.TOOLBOX_CODEX_TOOL_IDLE_TIMEOUT_MS), DEFAULT_IDLE_TIMEOUT_MS)
}

export function configuredToolExecutionMaxDurationMs(env: NodeJS.ProcessEnv = process.env): number {
  return boundedDuration(configuredNumber(env.TOOLBOX_CODEX_TOOL_MAX_DURATION_MS), DEFAULT_MAX_DURATION_MS)
}

export function configuredToolExecutionHeartbeatMs(env: NodeJS.ProcessEnv = process.env): number {
  return boundedDuration(configuredNumber(env.TOOLBOX_CODEX_TOOL_HEARTBEAT_MS), DEFAULT_HEARTBEAT_MS)
}

function isTrackedTool(event: Record<string, unknown>): boolean {
  return !isMcpToolEvent(event)
}

function boundedDuration(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, Math.trunc(value as number)))
}

function positiveDuration(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.trunc(value as number))
}

function configuredNumber(value: string | undefined): number | undefined {
  return value?.trim() ? Number(value) : undefined
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
