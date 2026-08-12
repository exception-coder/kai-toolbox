import {
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
  type Context,
  type Span,
} from '@opentelemetry/api'
import { inputKeySummary, outputLength, sanitizeAttributes, sanitizeText } from './sanitizer.js'
import { telemetryEnabled } from './telemetry.js'
import { evidenceAttributes, summarizeToolEvidence, type ToolEvidenceSummary } from './evidenceSummary.js'

export interface TraceContextCarrier {
  traceparent?: string
  tracestate?: string
}

export interface AgentTelemetryMetadata {
  scope?: string
  correlationId?: string
  turnIndex?: number
  engine?: string
  model?: string
  attributes?: Record<string, unknown>
}

interface ToolTrace {
  span: Span
  timer: NodeJS.Timeout
  toolName: string
  input: unknown
}

interface ActiveTrace {
  span: Span
  spanContext: Context
  tools: Map<string, ToolTrace>
  timer: NodeJS.Timeout
  toolCalls: number
  repeatedToolCalls: number
  toolSignatures: Set<string>
  evidence: ToolEvidenceSummary[]
}

const AGENT_TRACE_TTL_MS = 30 * 60 * 1000
const TOOL_TRACE_TTL_MS = 10 * 60 * 1000

/** 在统一 sidecar 事件出口维护 Agent 与工具 Span，不侵入具体引擎实现。 */
export class AgentTracing {
  private readonly tracer = trace.getTracer('kai-toolbox-agent-sidecar', '1.0.0')
  private readonly active = new Map<string, ActiveTrace>()

  begin(sessionId: string, carrier: unknown, metadata: unknown): void {
    if (!telemetryEnabled() || !sessionId) return
    this.finish(sessionId, 'replaced', true)
    const parent = propagation.extract(ROOT_CONTEXT, normalizeCarrier(carrier))
    const safeMetadata = normalizeMetadata(metadata)
    const attributes: Record<string, string | number | boolean> = {
      'gen_ai.operation.name': 'invoke_agent',
      'agent.scope': safeMetadata.scope || 'agent',
      'agent.runtime.session.id': sanitizeText(sessionId),
      ...sanitizeAttributes(safeMetadata.attributes),
    }
    if (safeMetadata.correlationId) attributes['consult.session.id'] = sanitizeText(safeMetadata.correlationId)
    if (safeMetadata.turnIndex != null) attributes['consult.turn.index'] = safeMetadata.turnIndex
    if (safeMetadata.engine) {
      attributes['agent.engine'] = sanitizeText(safeMetadata.engine)
      attributes['gen_ai.provider.name'] = sanitizeText(safeMetadata.engine)
    }
    if (safeMetadata.model) attributes['gen_ai.request.model'] = sanitizeText(safeMetadata.model)

    const span = this.tracer.startSpan('agent.invoke', { kind: SpanKind.INTERNAL, attributes }, parent)
    const spanContext = trace.setSpan(parent, span)
    const timer = setTimeout(() => this.finish(sessionId, 'trace timeout', true), AGENT_TRACE_TTL_MS)
    timer.unref?.()
    this.active.set(sessionId, {
      span, spanContext, tools: new Map(), timer, toolCalls: 0,
      repeatedToolCalls: 0, toolSignatures: new Set(), evidence: [],
    })
  }

  observe(sessionId: string, event: Record<string, unknown>): Record<string, unknown> {
    const active = this.active.get(sessionId)
    if (!active) return event
    const type = typeof event.type === 'string' ? event.type : ''
    if (type === 'toolUse') this.startTool(active, event)
    else if (type === 'toolResult') this.finishTool(active, event)
    else if (type === 'permissionRequest') active.span.addEvent('agent.permission.requested')
    else if (type === 'error') {
      const message = sanitizeText(event.message)
      const enriched = { ...event, traceId: active.span.spanContext().traceId }
      active.span.addEvent('agent.error', { 'error.message': message })
      active.span.setStatus({ code: SpanStatusCode.ERROR, message })
      this.finish(sessionId, message || 'agent error', true)
      return enriched
    } else if (type === 'result') {
      const traceId = active.span.spanContext().traceId
      const stopReason = sanitizeText(event.stopReason || 'end_turn')
      const enriched = {
        ...event,
        traceId,
        evidence: active.evidence,
        trajectory: {
          modelCalls: null,
          modelCallObservation: 'UNAVAILABLE',
          toolCalls: active.toolCalls,
          repeatedToolCalls: active.repeatedToolCalls,
          sourceTypes: [...new Set(active.evidence.map(item => item.sourceType))],
        },
      }
      this.applyUsage(active.span, event.usage)
      this.finish(sessionId, stopReason, stopReason === 'error' || stopReason === 'interrupted')
      return enriched
    }
    return event
  }

  finishAll(reason: string): void {
    for (const sessionId of [...this.active.keys()]) this.finish(sessionId, reason, true)
  }

  finishSession(sessionId: string, reason: string): void {
    this.finish(sessionId, reason, true)
  }

  private startTool(active: ActiveTrace, event: Record<string, unknown>): void {
    const callId = sanitizeText(event.toolCallId).trim()
    if (!callId || active.tools.has(callId)) return
    const toolName = sanitizeText(event.toolName || 'unknown')
    const attributes: Record<string, string | number | boolean> = {
      'gen_ai.operation.name': 'execute_tool',
      'gen_ai.tool.call.id': callId,
      'gen_ai.tool.name': toolName,
      'gen_ai.tool.type': 'function',
      'tool.input.keys': inputKeySummary(event.input),
    }
    const mcpServer = parseMcpServer(toolName)
    if (mcpServer) attributes['mcp.server.name'] = mcpServer
    const span = this.tracer.startSpan(`execute_tool: ${toolName}`, {
      kind: SpanKind.INTERNAL,
      attributes,
    }, active.spanContext)
    const timer = setTimeout(() => {
      const current = active.tools.get(callId)
      if (!current) return
      current.span.setStatus({ code: SpanStatusCode.ERROR, message: 'tool result timeout' })
      current.span.end()
      active.tools.delete(callId)
    }, TOOL_TRACE_TTL_MS)
    timer.unref?.()
    active.tools.set(callId, { span, timer, toolName, input: event.input })
    active.toolCalls++
    const preliminary = summarizeToolEvidence(toolName, event.input, undefined)
    const signature = `${toolName}|${preliminary.queryFingerprint ?? inputKeySummary(event.input)}`
    if (active.toolSignatures.has(signature)) active.repeatedToolCalls++
    active.toolSignatures.add(signature)
  }

  private finishTool(active: ActiveTrace, event: Record<string, unknown>): void {
    const callId = sanitizeText(event.toolCallId).trim()
    const tool = active.tools.get(callId)
    if (!tool) return
    clearTimeout(tool.timer)
    const failed = event.isError === true
    tool.span.setAttribute('tool.status', failed ? 'ERROR' : 'OK')
    tool.span.setAttribute('tool.output.length', outputLength(event.output))
    const evidence = summarizeToolEvidence(tool.toolName, tool.input, event.output, event.evidence)
    if (active.evidence.length < 50) active.evidence.push(evidence)
    for (const [key, value] of Object.entries(evidenceAttributes(evidence))) {
      tool.span.setAttribute(key, value)
    }
    tool.span.setStatus({ code: failed ? SpanStatusCode.ERROR : SpanStatusCode.OK })
    tool.span.end()
    active.tools.delete(callId)
  }

  private finish(sessionId: string, reason: string, failed: boolean): void {
    const active = this.active.get(sessionId)
    if (!active) return
    this.active.delete(sessionId)
    clearTimeout(active.timer)
    for (const tool of active.tools.values()) {
      clearTimeout(tool.timer)
      tool.span.setStatus({ code: SpanStatusCode.ERROR, message: sanitizeText(reason) })
      tool.span.end()
    }
    active.tools.clear()
    active.span.setAttribute('agent.tool_call_count', active.toolCalls)
    active.span.setAttribute('agent.repeated_tool_call_count', active.repeatedToolCalls)
    active.span.setAttribute('agent.stop_reason', sanitizeText(reason))
    active.span.setStatus({ code: failed ? SpanStatusCode.ERROR : SpanStatusCode.OK, message: failed ? sanitizeText(reason) : undefined })
    active.span.end()
  }

  private applyUsage(span: Span, usage: unknown): void {
    if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return
    const values = usage as Record<string, unknown>
    for (const [source, target] of [
      ['input_tokens', 'gen_ai.usage.input_tokens'],
      ['output_tokens', 'gen_ai.usage.output_tokens'],
      ['inputTokens', 'gen_ai.usage.input_tokens'],
      ['outputTokens', 'gen_ai.usage.output_tokens'],
    ] as const) {
      const value = values[source]
      if (typeof value === 'number' && Number.isFinite(value)) span.setAttribute(target, value)
    }
  }
}

function normalizeCarrier(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const raw = value as Record<string, unknown>
  const carrier: Record<string, string> = {}
  if (typeof raw.traceparent === 'string') carrier.traceparent = raw.traceparent
  if (typeof raw.tracestate === 'string') carrier.tracestate = raw.tracestate
  return carrier
}

function normalizeMetadata(value: unknown): AgentTelemetryMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const raw = value as Record<string, unknown>
  return {
    scope: typeof raw.scope === 'string' ? raw.scope : undefined,
    correlationId: typeof raw.correlationId === 'string' ? raw.correlationId : undefined,
    turnIndex: typeof raw.turnIndex === 'number' && Number.isFinite(raw.turnIndex) ? raw.turnIndex : undefined,
    engine: typeof raw.engine === 'string' ? raw.engine : undefined,
    model: typeof raw.model === 'string' ? raw.model : undefined,
    attributes: raw.attributes && typeof raw.attributes === 'object' && !Array.isArray(raw.attributes)
      ? raw.attributes as Record<string, unknown>
      : undefined,
  }
}

function parseMcpServer(toolName: string): string | undefined {
  const match = /^mcp__(.+?)__/i.exec(toolName)
  return match?.[1] ? sanitizeText(match[1]) : undefined
}
