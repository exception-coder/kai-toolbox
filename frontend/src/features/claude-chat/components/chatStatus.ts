import type { StatusTone } from '@/components/ui/status-badge'
import type { ChatItem, Engine, ProviderKind } from '../types'

/** 连接态中文文案，供单会话页与分屏块共用。 */
export function stateLabel(s: string): string {
  switch (s) {
    case 'connecting': return '连接中…'
    case 'ready': return '已连接'
    case 'closed': return '已断开（重连中）'
    case 'error': return '连接出错'
    default: return ''
  }
}

/** 连接态对应的状态徽标色调。 */
export function stateTone(s: string): StatusTone {
  switch (s) {
    case 'connecting': return 'info'
    case 'ready': return 'success'
    case 'closed': return 'warning'
    case 'error': return 'danger'
    default: return 'neutral'
  }
}

/** 引擎显示名。 */
export function engineName(e: Engine): string {
  return e === 'codex' ? 'Codex' : e === 'gemini' ? 'Gemini' : e === 'opencode' ? 'OpenCode' : 'Claude'
}

/** 引擎 + 服务商显示名：走第三方网关的引擎（Claude/Codex）显式标「· 第三方」，避免与官方登录混淆。 */
export function engineDisplayName(e: Engine, providerKind?: ProviderKind): string {
  const base = engineName(e)
  return providerKind === 'thirdParty' ? `${base} · 第三方` : base
}

/** 从第三方网关 baseURL 提取短 host；URL 非法时回退原字符串。 */
export function providerHost(providerBaseUrl?: string | null): string | null {
  if (!providerBaseUrl) return null
  try {
    return new URL(providerBaseUrl).host
  } catch {
    return providerBaseUrl
  }
}

// ── Agent（会话）业务状态：用于分屏「Agent 列表 + 详情」的一眼概览 ──────────

export type AgentStatusKind = 'running' | 'error' | 'connecting' | 'idle'

export interface AgentStatus {
  kind: AgentStatusKind
  /** 报错时的简短文案（取最近一条 error 或连接错误）。 */
  errorText?: string
  /** 消息条数，用于列表副信息。 */
  count: number
}

/**
 * 从聊天运行时派生 Agent 业务状态。优先级：运行中 &gt; 报错 &gt; 连接中 &gt; 空闲。
 * 只用我们真实拥有的信号（running / items / 连接态 / errorMessage），不编造步骤进度。
 */
export function deriveAgentStatus(
  state: string,
  running: boolean,
  items: ChatItem[],
  errorMessage: string | null,
): AgentStatus {
  const count = items.length
  if (running) return { kind: 'running', count }
  let errorText = errorMessage ?? undefined
  if (!errorText) {
    const last = items[items.length - 1]
    if (last && last.kind === 'error') errorText = last.message
  }
  if (errorText) return { kind: 'error', errorText, count }
  if (state === 'connecting' || state === 'closed') return { kind: 'connecting', count }
  return { kind: 'idle', count }
}

/** Agent 状态的展示元信息（标签 + 圆点底色 + 文字色 + 是否脉冲）。类名均为静态字面量，便于 Tailwind 收集。 */
export function agentStatusMeta(kind: AgentStatusKind): {
  label: string
  dot: string
  text: string
  pulse: boolean
} {
  switch (kind) {
    case 'running': return { label: '运行中', dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', pulse: true }
    case 'error': return { label: '报错', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400', pulse: false }
    case 'connecting': return { label: '连接中', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', pulse: true }
    default: return { label: '空闲', dot: 'bg-gray-400', text: 'text-[var(--color-muted-foreground)]', pulse: false }
  }
}

/**
 * 给每个 Agent 一个稳定区分色（按列表序号取）。仅用于卡片左边框 / 详情头部的轻量染色，
 * 用 8 位 hex 加透明度做底色（在亮/暗主题下都柔和），实色用于圆点与边框。
 */
export const AGENT_ACCENTS: string[] = [
  '#3b82f6', // blue
  '#f43f5e', // rose
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#f59e0b', // amber
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#14b8a6', // teal
]

export function agentAccent(index: number): string {
  return AGENT_ACCENTS[index % AGENT_ACCENTS.length]
}
