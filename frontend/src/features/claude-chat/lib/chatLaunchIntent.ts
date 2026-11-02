import type { LaunchIntentPayload } from '@/shell/launch-intent/types'

export type ChatLaunchCommand =
  | { kind: 'OPEN_DRAFT'; cwd: string; seed: string; previousSessionId: string | null }
  | { kind: 'OPEN_PANEL'; panel: Exclude<Extract<LaunchIntentPayload, { type: 'CHAT_OPEN_PANEL' }>['panel'], 'taskspace'> }
  | {
      kind: 'OPEN_AND_SEND'
      cwd: string
      seed: string
      engine: Extract<LaunchIntentPayload, { type: 'CHAT_OPEN_AND_SEND' }>['engine']
      codexHome?: string
      prdSessionId?: string
      previousSessionId: string | null
    }

/** 把跨模块启动协议转换为 ChatPage 可执行的确定性命令。 */
export function planChatLaunch(
  payload: LaunchIntentPayload,
  currentSessionId: string | null,
): ChatLaunchCommand {
  if (payload.type === 'CHAT_OPEN_DRAFT') {
    return {
      kind: 'OPEN_DRAFT',
      cwd: payload.cwd.trim(),
      seed: payload.seed,
      previousSessionId: currentSessionId,
    }
  }
  if (payload.type === 'CHAT_OPEN_PANEL') {
    // 兼容旧启动链接，但不重新挂载已移除的合并功能，也不自动创建会话。
    return { kind: 'OPEN_PANEL', panel: payload.panel === 'taskspace' ? 'new' : payload.panel }
  }
  return {
    kind: 'OPEN_AND_SEND',
    cwd: payload.cwd.trim(),
    seed: payload.seed,
    engine: payload.engine,
    codexHome: payload.codexHome?.trim() || undefined,
    prdSessionId: payload.prdSessionId,
    previousSessionId: currentSessionId,
  }
}

/** 新建会话必须拿到不同于来源会话的权威 ID 后，才能投递启动消息。 */
export function isChatLaunchTargetReady(
  previousSessionId: string | null,
  currentSessionId: string | null,
): currentSessionId is string {
  return !!currentSessionId && currentSessionId !== previousSessionId
}
