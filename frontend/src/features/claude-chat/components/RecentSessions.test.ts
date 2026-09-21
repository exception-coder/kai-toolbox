import { describe, expect, it } from 'vitest'
import { groupRecentSessionsByWorkspace } from './RecentSessions'
import type { ClaudeChatSessionView } from '../types'

function session(id: string, cwd: string, lastSeenAt: number, favorite = false): ClaudeChatSessionView {
  return { id, cwd, lastSeenAt, favorite, engine: 'codex', status: 'IDLE' } as ClaudeChatSessionView
}

describe('groupRecentSessionsByWorkspace', () => {
  it('groups equivalent Windows paths and orders groups by latest activity', () => {
    const groups = groupRecentSessionsByWorkspace([
      session('a1', 'D:\\Work\\Alpha', 100),
      session('b1', 'D:\\Work\\Beta', 300),
      session('a2', 'd:/work/alpha/', 200, true),
    ])

    expect(groups.map(group => group.label)).toEqual(['Beta', 'Alpha'])
    expect(groups[1].sessions.map(item => item.id)).toEqual(['a2', 'a1'])
  })

  it('keeps missing workspace data in one explicit fallback group', () => {
    const groups = groupRecentSessionsByWorkspace([session('a', '', 10), session('b', '  ', 20)])
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('未识别工作区')
  })
})
