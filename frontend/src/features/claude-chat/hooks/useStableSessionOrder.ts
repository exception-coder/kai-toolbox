import { useState } from 'react'
import type { ClaudeChatSessionView } from '../types'

export const sessionActivityAt = (session: ClaudeChatSessionView) => session.lastActivityAt ?? session.lastSeenAt

/** 冻结导航排序依据，行内状态仍使用实时对象；明确刷新/进入视图时才采纳新活动。 */
export function useStableSessionOrder(sessions: ClaudeChatSessionView[], scope: string) {
  const capture = () => ({ scope, activities: new Map(sessions.map(session => [session.id, sessionActivityAt(session)])) })
  const [snapshot, setSnapshot] = useState(capture)
  if (snapshot.scope !== scope || snapshot.activities.size === 0 && sessions.length > 0) {
    setSnapshot(capture())
  }
  const activityAt = (session: ClaudeChatSessionView) => snapshot.activities.get(session.id) ?? sessionActivityAt(session)
  const compare = (left: ClaudeChatSessionView, right: ClaudeChatSessionView) =>
    activityAt(right) - activityAt(left) || left.id.localeCompare(right.id)
  const comparePinned = (left: ClaudeChatSessionView, right: ClaudeChatSessionView) =>
    Number(Boolean(right.favorite)) - Number(Boolean(left.favorite))
    || (right.pinnedAt ?? 0) - (left.pinnedAt ?? 0) || compare(left, right)
  const ordered = sessions.filter(session => snapshot.activities.has(session.id) || session.favorite).sort(compare)
  const hasUpdates = sessions.some(session => !snapshot.activities.has(session.id)
    || sessionActivityAt(session) > (snapshot.activities.get(session.id) ?? 0))
  return { ordered, compare, comparePinned, activityAt, hasUpdates, refresh: () => setSnapshot(capture()) }
}
