import type { ChatItem } from '../types'
import { isVoiceTranscriptItem } from './voiceTranscript'

/** 流式文本追加到最后一条助手回复；最后一条不是助手回复（或是语音转写）时新建一条。 */
export function appendAssistantDelta(items: ChatItem[], text: string, newId: () => string, now = Date.now()): ChatItem[] {
  const last = items[items.length - 1]
  if (last && last.kind === 'assistant' && !isVoiceTranscriptItem(last)) {
    return [...items.slice(0, -1), { ...last, text: last.text + text }]
  }
  return [...items, { kind: 'assistant', id: newId(), text, ts: now }]
}

/** 工具调用开始：有稳定调用 ID 时按 ID 原位更新，否则追加。 */
export function upsertToolUse(items: ChatItem[], tool: { toolCallId?: string | null; toolName: string; input: unknown },
                              newId: () => string, now = Date.now()): ChatItem[] {
  const toolCallId = tool.toolCallId || undefined
  const id = toolCallId ? `tool-${toolCallId}` : newId()
  const index = toolCallId ? items.findIndex(item => item.kind === 'tool' && item.toolCallId === toolCallId) : -1
  const next = { kind: 'tool' as const, id, toolCallId, toolName: tool.toolName, input: tool.input, ts: now }
  if (index < 0) return [...items, next]
  const copy = items.slice()
  copy[index] = { ...items[index], ...next }
  return copy
}

/**
 * 工具结果回填：新协议按稳定调用 ID 精确回填，旧 Sidecar 没有 ID 时按名称回填最近一条未完成调用；
 * 都找不到时追加一条只有结果的工具记录。
 */
export function applyToolResult(items: ChatItem[], result: { toolCallId?: string | null; toolName: string; output: string; isError?: boolean },
                                newId: () => string, now = Date.now()): ChatItem[] {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    const matched = it.kind === 'tool' && it.output === undefined && (result.toolCallId
      ? it.toolCallId === result.toolCallId
      : it.toolName === result.toolName)
    if (matched) {
      const copy = items.slice()
      copy[i] = { ...it, output: result.output, isError: result.isError,
        elapsedMs: it.ts == null ? undefined : Math.max(0, now - it.ts) }
      return copy
    }
  }
  const toolCallId = result.toolCallId || undefined
  return [...items, { kind: 'tool', id: toolCallId ? `tool-${toolCallId}` : newId(), toolCallId,
    toolName: result.toolName, input: null, output: result.output, isError: result.isError, ts: now }]
}
