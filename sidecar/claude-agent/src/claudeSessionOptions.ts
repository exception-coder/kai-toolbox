import type { Query } from '@anthropic-ai/claude-agent-sdk'

export type ClaudeEffort = 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export interface ClaudeSessionOptions { effort: ClaudeEffort; ultracode: boolean }

const EFFORTS = new Set(['auto', 'low', 'medium', 'high', 'xhigh', 'max'])

export function parseClaudeSessionOptions(value: unknown): ClaudeSessionOptions {
  const options = value as Partial<ClaudeSessionOptions> | null
  if (!options || !EFFORTS.has(options.effort ?? '') || typeof options.ultracode !== 'boolean') {
    throw new Error('无效的 Claude 会话强度配置')
  }
  return { effort: options.effort!, ultracode: options.ultracode }
}

/** 原生 flag 层支持 max 和 null；不写用户设置，auto 恢复模型默认。 */
export async function applyClaudeSessionOptions(
  query: Pick<Query, 'applyFlagSettings'>,
  options: ClaudeSessionOptions,
): Promise<void> {
  await query.applyFlagSettings({
    effortLevel: options.effort === 'auto' ? null : options.effort,
    ultracode: options.ultracode,
  })
}
