export const LAUNCH_INTENT_PROTOCOL_VERSION = 1 as const

export type LaunchEngine = 'claude' | 'codex' | 'gemini' | 'opencode' | 'deepseekHarness'

export type LaunchIntentPayload =
  | {
      type: 'CHAT_OPEN_DRAFT'
      cwd: string
      seed: string
    }
  | {
      type: 'CHAT_OPEN_AND_SEND'
      cwd: string
      seed: string
      engine: LaunchEngine
      codexHome?: string
      prdSessionId?: string
    }
  | {
      type: 'CHAT_OPEN_PANEL'
      panel: 'clone' | 'taskspace' | 'new' | 'filetree' | 'onboard'
        | 'caps' | 'providers' | 'plugins' | 'settings' | 'sessions'
    }

export type LaunchIntentState = 'PENDING' | 'FAILED' | 'ACKED' | 'EXPIRED'

export interface LaunchIntentView {
  id: string
  protocolVersion: number
  payload: LaunchIntentPayload
  state: LaunchIntentState
  createdAt: number
  expiresAt: number
  lastError?: string | null
}

export function parseLaunchIntent(value: unknown): LaunchIntentView {
  const view = requireRecord(value, '启动意图响应')
  if (view.protocolVersion !== LAUNCH_INTENT_PROTOCOL_VERSION) {
    throw new Error(`不支持的启动意图协议版本: ${String(view.protocolVersion)}`)
  }
  const type = requireString(view.type, 'type')
  const rawPayload = requireRecord(view.payload, 'payload')
  const payload = parsePayload(type, rawPayload)
  const state = requireString(view.state, 'state')
  if (!['PENDING', 'FAILED', 'ACKED', 'EXPIRED'].includes(state)) {
    throw new Error(`未知启动意图状态: ${state}`)
  }
  return {
    id: requireString(view.id, 'id'),
    protocolVersion: LAUNCH_INTENT_PROTOCOL_VERSION,
    payload,
    state: state as LaunchIntentState,
    createdAt: requireNumber(view.createdAt, 'createdAt'),
    expiresAt: requireNumber(view.expiresAt, 'expiresAt'),
    lastError: typeof view.lastError === 'string' ? view.lastError : null,
  }
}

function parsePayload(type: string, payload: Record<string, unknown>): LaunchIntentPayload {
  if (type === 'CHAT_OPEN_DRAFT') {
    return { type, cwd: requireString(payload.cwd, 'cwd', true), seed: requireString(payload.seed, 'seed') }
  }
  if (type === 'CHAT_OPEN_AND_SEND') {
    const engine = requireString(payload.engine, 'engine')
    if (!['claude', 'codex', 'gemini', 'opencode', 'deepseekHarness'].includes(engine)) {
      throw new Error(`未知启动引擎: ${engine}`)
    }
    return {
      type,
      cwd: requireString(payload.cwd, 'cwd', true),
      seed: requireString(payload.seed, 'seed'),
      engine: engine as LaunchEngine,
      codexHome: optionalString(payload.codexHome),
      prdSessionId: optionalString(payload.prdSessionId),
    }
  }
  if (type === 'CHAT_OPEN_PANEL') {
    const panel = requireString(payload.panel, 'panel')
    const panels = ['clone', 'taskspace', 'new', 'filetree', 'onboard', 'caps',
      'providers', 'plugins', 'settings', 'sessions'] as const
    if (!panels.includes(panel as typeof panels[number])) throw new Error(`未知面板: ${panel}`)
    return { type, panel: panel as typeof panels[number] }
  }
  throw new Error(`未知启动意图类型: ${type}`)
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} 必须是对象`)
  return value as Record<string, unknown>
}

function requireString(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) throw new Error(`${field} 必须是非空字符串`)
  return value
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${field} 必须是数字`)
  return value
}
