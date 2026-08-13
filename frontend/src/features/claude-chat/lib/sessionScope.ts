import type { ClaudeChatSessionView } from '../types'

export const BUSINESS_CONSULT_GROUP = '业务咨询'

type SessionScopeFields = Pick<ClaudeChatSessionView, 'group'>

/** 业务咨询复用底层聊天会话，但不属于 Vibe Coding 的会话导航与自动恢复范围。 */
export function isBusinessConsultSession(session: SessionScopeFields): boolean {
  return (session.group ?? '').trim() === BUSINESS_CONSULT_GROUP
}

export function isVibeCodingSession(session: SessionScopeFields): boolean {
  return !isBusinessConsultSession(session)
}
