import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import {
  HarnessClient,
  type ContentBlock,
  type HarnessClientOptions,
  type HarnessNotification,
  type NotificationSubscription,
} from '@deepseek-ai/dsh-sdk-client'
import type {
  AgentEngineAdapter,
  AgentEvent,
  AgentEventType,
  EngineDescriptor,
  EngineProbeResult,
  EngineRuntimeObservation,
  EngineRuntimeSnapshot,
  EngineTurnRequest,
} from './engineContract.js'

const SDK_PACKAGE = '@deepseek-ai/dsh-sdk-client'
export const DEEPSEEK_HARNESS_SDK_VERSION = '0.1.0-rc.6'
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 15_000
const DEFAULT_TURN_TIMEOUT_MS = 30 * 60_000

export interface DeepSeekHarnessAdapterConfig {
  enabled: boolean
  runtimeCommand?: string
  runtimeArgs: readonly string[]
  cwd: string
  provider: string
  model: string
  maxTokens?: number
  handshakeTimeoutMs: number
  turnTimeoutMs: number
  env?: NodeJS.ProcessEnv
}

interface HarnessClientLike {
  start(): void
  initialize(params: {
    cwd: string
    provider: string
    model: string
    maxTokens?: number
  }): Promise<{ serverInfo: { name: string; version: string } }>
  prompt(sessionId: string, contentBlocks: ContentBlock[]): Promise<string>
  subscribeSessionTree(sessionId: string): NotificationSubscription
  close(): Promise<void>
}

export interface DeepSeekHarnessAdapterDependencies {
  sdkVersion: string
  createClient(options: HarnessClientOptions): HarnessClientLike
}

const descriptor: EngineDescriptor = {
  id: 'deepseekHarness',
  displayName: 'DeepSeek Harness',
  capabilities: new Set(['resume', 'interrupt', 'runtimeState', 'subagents']),
  availability: 'experimental',
}

/**
 * Experimental DeepSeek Harness adapter.
 *
 * The official SDK currently has no prompt-level cancellation method. Cancellation therefore
 * closes and reaps the owned runtime process, which is also the hard timeout fallback.
 */
export class DeepSeekHarnessAdapter implements AgentEngineAdapter {
  readonly descriptor = descriptor
  private client?: HarnessClientLike
  private handshake?: EngineProbeResult
  private running = false
  private interruptRequested = false

  constructor(
    private readonly config: DeepSeekHarnessAdapterConfig,
    private readonly dependencies: DeepSeekHarnessAdapterDependencies = defaultDependencies(),
  ) {}

  async probe(): Promise<EngineProbeResult> {
    if (!this.config.enabled) {
      return this.remember({ status: 'disabled', engine: descriptor.id, detail: 'Experimental engine flag is disabled' })
    }
    if (!this.config.runtimeCommand) {
      return this.remember({
        status: 'unavailable',
        engine: descriptor.id,
        sdkVersion: this.dependencies.sdkVersion,
        detail: 'DeepSeek Harness runtime command is not configured',
      })
    }
    if (this.dependencies.sdkVersion !== DEEPSEEK_HARNESS_SDK_VERSION) {
      return this.remember({
        status: 'incompatible',
        engine: descriptor.id,
        sdkVersion: this.dependencies.sdkVersion,
        detail: `Expected ${SDK_PACKAGE}@${DEEPSEEK_HARNESS_SDK_VERSION}`,
      })
    }

    try {
      const client = this.ensureClient()
      client.start()
      const initialized = await withDeadline(
        client.initialize({
          cwd: this.config.cwd,
          provider: this.config.provider,
          model: this.config.model,
          ...(this.config.maxTokens === undefined ? {} : { maxTokens: this.config.maxTokens }),
        }),
        this.config.handshakeTimeoutMs,
        'DeepSeek Harness initialize handshake',
      )
      if (initialized.serverInfo.name !== 'deepseek-harness-sdk-runtime') {
        await this.resetClient()
        return this.remember({
          status: 'incompatible',
          engine: descriptor.id,
          sdkVersion: this.dependencies.sdkVersion,
          runtimeName: initialized.serverInfo.name,
          runtimeVersion: initialized.serverInfo.version,
          detail: 'Runtime identity does not match the official SDK protocol',
        })
      }
      return this.remember({
        status: 'ready',
        engine: descriptor.id,
        channel: 'official-sdk-jsonrpc',
        sdkVersion: this.dependencies.sdkVersion,
        runtimeName: initialized.serverInfo.name,
        runtimeVersion: initialized.serverInfo.version,
      })
    } catch (error) {
      await this.resetClient()
      return this.remember({
        status: isMissingRuntime(error) ? 'dependencyMissing' : 'unavailable',
        engine: descriptor.id,
        sdkVersion: this.dependencies.sdkVersion,
        detail: errorMessage(error),
      })
    }
  }

  async runTurn(request: EngineTurnRequest): Promise<void> {
    const readiness = this.handshake?.status === 'ready' ? this.handshake : await this.probe()
    if (readiness.status !== 'ready') {
      throw new Error(`DeepSeek Harness is not ready: ${readiness.detail ?? readiness.status}`)
    }
    if (this.running) throw new Error('DeepSeek Harness adapter already owns an active turn')
    if (request.images?.length) {
      throw new Error('DeepSeek Harness image attachments are not enabled until the official content-block contract is verified')
    }

    const client = this.ensureClient()
    const subscription = client.subscribeSessionTree(request.sessionId)
    const abortListener = (): void => { void this.interrupt() }
    request.signal?.addEventListener('abort', abortListener, { once: true })
    this.running = true
    this.interruptRequested = false
    request.emit(this.event(request, 'turn.started', { channel: readiness.channel }))
    try {
      await withDeadline(
        this.collectTurn(client, subscription, request),
        this.config.turnTimeoutMs,
        'DeepSeek Harness turn',
        () => this.resetClient(),
      )
      request.emit(this.event(request, 'turn.completed', {}))
    } catch (error) {
      const interrupted = this.interruptRequested || request.signal?.aborted === true
      request.emit(this.event(request, interrupted ? 'turn.interrupted' : 'turn.failed', {
        message: errorMessage(error),
      }))
      throw error
    } finally {
      this.running = false
      this.interruptRequested = false
      subscription.close()
      request.signal?.removeEventListener('abort', abortListener)
    }
  }

  async interrupt(): Promise<void> {
    if (!this.running) return
    this.interruptRequested = true
    await this.resetClient()
  }

  runtimeState(observation: EngineRuntimeObservation): EngineRuntimeSnapshot {
    return {
      transport: this.client ? 'connected' : (this.handshake?.status === 'ready' ? 'unknown' : 'unavailable'),
      agentState: this.running ? 'running' : (observation.pendingDecision ? 'waiting' : 'idle'),
      stateSource: 'adapter',
    }
  }

  async dispose(): Promise<void> {
    await this.resetClient()
  }

  private async collectTurn(client: HarnessClientLike, subscription: NotificationSubscription,
                            request: EngineTurnRequest): Promise<void> {
    const messageId = await client.prompt(request.sessionId, [{ type: 'text', text: composePrompt(request) }])
    let received = false
    const streamedSteps = new Set<string>()
    const toolNames = new Map<string, string>()
    const subagents = new Map<string, { id: string; parentId?: string; state: string }>()
    while (true) {
      const notification = await subscription.next()
      if (!received) {
        received = isInboxReceipt(notification, request.sessionId, messageId)
        if (!received) continue
      }
      this.emitNotification(request, notification, streamedSteps, toolNames, subagents)
      if (isIdle(notification, request.sessionId)) return
    }
  }

  private emitNotification(request: EngineTurnRequest, notification: HarnessNotification,
                           streamedSteps: Set<string>, toolNames: Map<string, string>,
                           subagents: Map<string, { id: string; parentId?: string; state: string }>): void {
    if (notification.method === 'subagent.started') {
      const childId = stringValue(notification.params.childSessionId)
      if (childId) {
        subagents.set(childId, {
          id: childId,
          parentId: stringValue(notification.params.parentSessionId),
          state: 'running',
        })
      }
      this.emitSubagentsSnapshot(request, subagents, notification)
      return
    }
    if (notification.method === 'subagent.finished') {
      const childId = stringValue(notification.params.childSessionId) ?? stringValue(notification.params.agentId)
      if (childId) {
        const current = subagents.get(childId)
        subagents.set(childId, {
          id: childId,
          parentId: stringValue(notification.params.parentSessionId) ?? current?.parentId,
          state: normalizeSubagentState(notification.params.status),
        })
      }
      this.emitSubagentsSnapshot(request, subagents, notification)
      return
    }
    if (notification.method === 'session.status') {
      request.emit(this.event(request, 'engine.diagnostic', {
        status: notification.params.status,
      }, notification))
      return
    }
    if (notification.method !== 'session.event') return
    const nativeEvent = asRecord(notification.params.event)
    const eventType = typeof nativeEvent?.type === 'string' ? nativeEvent.type : ''
    const data = asRecord(nativeEvent?.data)
    const stepKey = `${numberValue(data?.turn)}:${numberValue(data?.step)}`
    if (eventType === 'assistant/chunk') {
      const chunk = asRecord(data?.chunk)
      if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
        streamedSteps.add(stepKey)
        request.emit(this.event(request, 'assistant.delta', { text: chunk.text }, notification))
      } else if (chunk?.type === 'reasoning-delta' && typeof chunk.text === 'string') {
        request.emit(this.event(request, 'reasoning.delta', { text: chunk.text }, notification))
      } else if (chunk?.type === 'usage') {
        request.emit(this.event(request, 'engine.diagnostic', { usage: chunk.usage }, notification))
      }
      return
    }
    if (eventType === 'assistant/message' && nativeEvent) {
      if (!streamedSteps.has(stepKey)) {
        const text = assistantText(nativeEvent)
        if (text) request.emit(this.event(request, 'assistant.delta', { text }, notification))
      }
      return
    }
    if (eventType === 'tool/call') {
      const callId = stringValue(data?.callId) ?? randomUUID()
      const name = stringValue(data?.name) ?? 'tool'
      toolNames.set(callId, name)
      request.emit(this.event(request, 'tool.started', {
        toolCallId: callId,
        toolName: name,
        input: parseJsonObject(data?.arguments),
      }, notification))
      return
    }
    if (eventType === 'tool/result') {
      const result = toolResult(data)
      request.emit(this.event(request, 'tool.completed', {
        toolCallId: result.callId,
        toolName: toolNames.get(result.callId) ?? 'tool',
        output: result.output,
        isError: result.isError,
      }, notification))
      return
    }
    request.emit(this.event(request, 'engine.diagnostic', { nativeType: eventType || 'unknown' }, notification))
  }

  private emitSubagentsSnapshot(request: EngineTurnRequest,
                                subagents: Map<string, { id: string; parentId?: string; state: string }>,
                                native: HarnessNotification): void {
    request.emit(this.event(request, 'subagents.snapshot', {
      source: descriptor.id,
      observedAt: Date.now(),
      agents: [...subagents.values()],
    }, native))
  }

  private event(request: EngineTurnRequest, type: AgentEventType, payload: Record<string, unknown>,
                native?: unknown): AgentEvent {
    return {
      protocolVersion: 1,
      eventId: randomUUID(),
      sessionId: request.sessionId,
      turnId: request.turnId,
      engine: descriptor.id,
      type,
      observedAt: Date.now(),
      payload,
      ...(native === undefined ? {} : { native }),
    }
  }

  private ensureClient(): HarnessClientLike {
    this.client ??= this.dependencies.createClient({
      command: this.config.runtimeCommand as string,
      args: [...this.config.runtimeArgs],
      cwd: this.config.cwd,
      env: this.config.env,
      requestTimeoutMs: this.config.handshakeTimeoutMs,
    })
    return this.client
  }

  private async resetClient(): Promise<void> {
    const client = this.client
    this.client = undefined
    this.handshake = undefined
    if (client) await client.close()
  }

  private remember(result: EngineProbeResult): EngineProbeResult {
    this.handshake = result
    return result
  }
}

export function deepSeekHarnessConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DeepSeekHarnessAdapterConfig {
  return {
    enabled: env.KAI_DEEPSEEK_HARNESS_ENABLED === 'true',
    runtimeCommand: trimmed(env.KAI_DEEPSEEK_HARNESS_COMMAND),
    runtimeArgs: jsonStringArray(env.KAI_DEEPSEEK_HARNESS_ARGS),
    cwd: trimmed(env.KAI_DEEPSEEK_HARNESS_CWD) ?? process.cwd(),
    provider: trimmed(env.KAI_DEEPSEEK_HARNESS_PROVIDER) ?? 'deepseek-official',
    model: trimmed(env.KAI_DEEPSEEK_HARNESS_MODEL) ?? 'deepseek-v4-flash',
    maxTokens: positiveNumber(env.KAI_DEEPSEEK_HARNESS_MAX_TOKENS),
    handshakeTimeoutMs: positiveNumber(env.KAI_DEEPSEEK_HARNESS_HANDSHAKE_TIMEOUT_MS) ?? DEFAULT_HANDSHAKE_TIMEOUT_MS,
    turnTimeoutMs: positiveNumber(env.KAI_DEEPSEEK_HARNESS_TURN_TIMEOUT_MS) ?? DEFAULT_TURN_TIMEOUT_MS,
  }
}

/** Probe first; callers must only register the returned adapter when the result is ready. */
export async function createReadyDeepSeekHarnessAdapter(
  config = deepSeekHarnessConfigFromEnv(),
  dependencies?: DeepSeekHarnessAdapterDependencies,
): Promise<{ adapter?: DeepSeekHarnessAdapter; probe: EngineProbeResult }> {
  const adapter = new DeepSeekHarnessAdapter(config, dependencies)
  const probe = await adapter.probe()
  if (probe.status !== 'ready') {
    await adapter.dispose()
    return { probe }
  }
  return { adapter, probe }
}

function defaultDependencies(): DeepSeekHarnessAdapterDependencies {
  return {
    sdkVersion: installedSdkVersion(),
    createClient: options => new HarnessClient(options),
  }
}

function installedSdkVersion(): string {
  const require = createRequire(import.meta.url)
  const packagePath = require.resolve(`${SDK_PACKAGE}/package.json`)
  const parsed = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: unknown }
  return typeof parsed.version === 'string' ? parsed.version : 'unknown'
}

function composePrompt(request: EngineTurnRequest): string {
  return [request.systemPrompt, request.developerInstructions, request.text]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join('\n\n')
}

function isInboxReceipt(notification: HarnessNotification, sessionId: string, messageId: string): boolean {
  if (notification.method !== 'session.event' || notification.params.sessionId !== sessionId) return false
  const event = asRecord(notification.params.event)
  if (event?.type !== 'agent/inbox/spliced') return false
  const data = asRecord(event.data)
  return Array.isArray(data?.inserted)
    && data.inserted.some(item => asRecord(item)?.id === messageId)
}

function isIdle(notification: HarnessNotification, sessionId: string): boolean {
  return notification.method === 'session.status'
    && notification.params.sessionId === sessionId
    && notification.params.status === 'idle'
}

function assistantText(event: Record<string, unknown>): string {
  const message = asRecord(asRecord(event.data)?.message)
  const content = message?.content
  if (!Array.isArray(content)) return ''
  return content.map(block => {
    const record = asRecord(block)
    return record?.type === 'text' && typeof record.text === 'string' ? record.text : ''
  }).join('')
}

function toolResult(data: Record<string, unknown> | undefined): { callId: string; output: string; isError: boolean } {
  const message = asRecord(data?.message)
  const block = Array.isArray(message?.content) ? asRecord(message.content[0]) : undefined
  const callId = stringValue(block?.toolCallId) ?? 'unknown'
  const content = Array.isArray(block?.content) ? block.content : []
  const output = content.map(item => {
    const record = asRecord(item)
    return (record?.type === 'text' || record?.type === 'reasoning') && typeof record.text === 'string'
      ? record.text
      : ''
  }).filter(Boolean).join('\n')
  return { callId, output, isError: block?.isError === true || data?.error != null }
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return asRecord(parsed) ?? { value: parsed }
  } catch {
    return { raw: value }
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function normalizeSubagentState(value: unknown): string {
  const status = stringValue(value)?.toLowerCase()
  if (status === 'completed' || status === 'success') return 'completed'
  if (status === 'failed' || status === 'error') return 'failed'
  if (status === 'interrupted' || status === 'cancelled' || status === 'canceled') return 'interrupted'
  return 'unknown'
}

function numberValue(value: unknown): number | string {
  return typeof value === 'number' || typeof value === 'string' ? value : 'unknown'
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

async function withDeadline<T>(task: Promise<T>, timeoutMs: number, label: string,
                               onTimeout?: () => Promise<void>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    let timingOut = false
    const timer = setTimeout(() => {
      if (settled) return
      timingOut = true
      void (async () => {
        try {
          await onTimeout?.()
        } finally {
          if (settled) return
          settled = true
          reject(new Error(`${label} timed out after ${timeoutMs}ms`))
        }
      })()
    }, timeoutMs)
    timer.unref?.()
    void task.then(
      value => {
        if (settled || timingOut) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        if (settled || timingOut) return
        settled = true
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function jsonStringArray(value: string | undefined): string[] {
  if (!value?.trim()) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) return parsed
  } catch {
    // The configuration is validated as an empty list; never shell-split an untrusted command string.
  }
  return []
}

function positiveNumber(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function trimmed(value: string | undefined): string | undefined {
  const result = value?.trim()
  return result ? result : undefined
}

function isMissingRuntime(error: unknown): boolean {
  const code = asRecord(error)?.code
  return code === 'ENOENT' || /not found|cannot find|enoent/i.test(errorMessage(error))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
