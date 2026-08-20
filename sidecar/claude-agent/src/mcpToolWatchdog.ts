export interface McpToolWatchdogEntry {
  toolCallId: string
  toolName: string
  toolInput?: Record<string, unknown>
  startedAt: number
  lastActivityAt: number
  timeoutMs: number
  maxDurationMs: number
  timeoutReason?: 'idle' | 'maxDuration'
  lastTitle?: string
  lastDetail?: string
}

interface ActiveMcpTool extends McpToolWatchdogEntry {
  deadline: NodeJS.Timeout
  hardDeadline: NodeJS.Timeout
  heartbeat: NodeJS.Timeout
}

interface McpToolWatchdogOptions {
  timeoutMs?: number
  maxDurationMs?: number
  heartbeatMs?: number
  onHeartbeat: (entry: McpToolWatchdogEntry) => void
  onTimeout: (entry: McpToolWatchdogEntry) => void
}

const DEFAULT_MCP_TOOL_TIMEOUT_MS = 60_000
const DEFAULT_MCP_TOOL_HEARTBEAT_MS = 10_000
const DEFAULT_MCP_TOOL_MAX_DURATION_MS = 5 * 60_000
const MIN_TIMEOUT_MS = 5_000
const MAX_TIMEOUT_MS = 30 * 60_000

/**
 * Tracks provider-neutral MCP tool events and turns missing tool results into a bounded failure.
 * Ordinary shell/edit tools are excluded because builds and tests can legitimately run for a long time.
 */
export class McpToolWatchdog {
  private readonly active = new Map<string, ActiveMcpTool>()
  private readonly timeoutMs: number
  private readonly heartbeatMs: number
  private readonly maxDurationMs: number

  constructor(private readonly options: McpToolWatchdogOptions) {
    this.timeoutMs = positiveDuration(options.timeoutMs, DEFAULT_MCP_TOOL_TIMEOUT_MS)
    this.heartbeatMs = positiveDuration(options.heartbeatMs, DEFAULT_MCP_TOOL_HEARTBEAT_MS)
    this.maxDurationMs = positiveDuration(options.maxDurationMs, DEFAULT_MCP_TOOL_MAX_DURATION_MS)
  }

  observe(event: Record<string, unknown>): void {
    if (event.watchdogGenerated === true) return
    const type = stringValue(event.type)
    const toolCallId = stringValue(event.toolCallId)

    if (type === 'toolUse' && toolCallId && isMcpToolEvent(event)) {
      this.start(toolCallId, stringValue(event.toolName) || 'MCP', recordValue(event.input))
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

  private start(toolCallId: string, toolName: string, toolInput?: Record<string, unknown>): void {
    this.finish(toolCallId)
    const now = Date.now()
    const entry = {
      toolCallId,
      toolName,
      toolInput,
      startedAt: now,
      lastActivityAt: now,
      timeoutMs: this.timeoutMs,
      maxDurationMs: this.maxDurationMs,
    }
    const tool: ActiveMcpTool = {
      ...entry,
      deadline: this.scheduleDeadline(entry),
      hardDeadline: this.scheduleHardDeadline(entry),
      heartbeat: setInterval(() => {
        const current = this.active.get(toolCallId)
        if (current) this.options.onHeartbeat(this.snapshot(current))
      }, this.heartbeatMs),
    }
    tool.deadline.unref?.()
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
    clearTimeout(tool.deadline)
    tool.deadline = this.scheduleDeadline(tool)
    tool.deadline.unref?.()
  }

  private finish(toolCallId: string): void {
    const tool = this.active.get(toolCallId)
    if (!tool) return
    this.clearTimers(tool)
    this.active.delete(toolCallId)
  }

  private scheduleDeadline(entry: McpToolWatchdogEntry): NodeJS.Timeout {
    return setTimeout(() => {
      const tool = this.active.get(entry.toolCallId)
      if (!tool) return
      this.clearTimers(tool)
      this.active.delete(entry.toolCallId)
      this.options.onTimeout(this.snapshot(tool, 'idle'))
    }, this.timeoutMs)
  }

  private scheduleHardDeadline(entry: McpToolWatchdogEntry): NodeJS.Timeout {
    return setTimeout(() => {
      const tool = this.active.get(entry.toolCallId)
      if (!tool) return
      this.clearTimers(tool)
      this.active.delete(entry.toolCallId)
      this.options.onTimeout(this.snapshot(tool, 'maxDuration'))
    }, this.maxDurationMs)
  }

  private clearTimers(tool: ActiveMcpTool): void {
    clearTimeout(tool.deadline)
    clearTimeout(tool.hardDeadline)
    clearInterval(tool.heartbeat)
  }

  private snapshot(tool: McpToolWatchdogEntry,
                   timeoutReason?: McpToolWatchdogEntry['timeoutReason']): McpToolWatchdogEntry {
    return {
      toolCallId: tool.toolCallId,
      toolName: tool.toolName,
      toolInput: tool.toolInput,
      startedAt: tool.startedAt,
      lastActivityAt: tool.lastActivityAt,
      timeoutMs: tool.timeoutMs,
      maxDurationMs: tool.maxDurationMs,
      timeoutReason,
      lastTitle: tool.lastTitle,
      lastDetail: tool.lastDetail,
    }
  }
}

export function configuredMcpToolTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return boundedDuration(configuredNumber(env.TOOLBOX_MCP_TOOL_TIMEOUT_MS), DEFAULT_MCP_TOOL_TIMEOUT_MS)
}

export function configuredMcpToolHeartbeatMs(env: NodeJS.ProcessEnv = process.env): number {
  return boundedDuration(configuredNumber(env.TOOLBOX_MCP_TOOL_HEARTBEAT_MS), DEFAULT_MCP_TOOL_HEARTBEAT_MS)
}

export function configuredMcpToolMaxDurationMs(env: NodeJS.ProcessEnv = process.env): number {
  return boundedDuration(configuredNumber(env.TOOLBOX_MCP_TOOL_MAX_DURATION_MS), DEFAULT_MCP_TOOL_MAX_DURATION_MS)
}

export function isMcpToolEvent(event: Record<string, unknown>): boolean {
  if (event.toolKind === 'mcp') return true
  const name = stringValue(event.toolName).toLowerCase()
  return name.startsWith('mcp__') || name.startsWith('mcp_') || name.includes('__')
}

function boundedDuration(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(value as number)))
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

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

export class McpToolTimeoutAbort extends Error {
  constructor(readonly entry: McpToolWatchdogEntry) {
    super(`MCP tool timed out: ${entry.toolName}`)
    this.name = 'McpToolTimeoutAbort'
  }
}

export function isMcpToolTimeoutAbort(reason: unknown): reason is McpToolTimeoutAbort {
  return reason instanceof McpToolTimeoutAbort
}
