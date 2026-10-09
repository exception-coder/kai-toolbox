import { describe, expect, it } from 'vitest'
import type { ClaudeChatSessionView } from '../types'
import { groupSessionsByProject, resolveSessionProject, sessionWorkspaceIdentity, sessionWorkspaceLabel } from './sessionProjectGroups'

function session(id: string, cwd: string, group: string | null = null): ClaudeChatSessionView {
  return { id, cwd, group, lastSeenAt: 10, status: 'IDLE', live: false } as ClaudeChatSessionView
}

describe('session directory identity', () => {
  it.each([
    [' D:\\Work\\Alpha\\ ', 'd:/work/alpha/'],
    ['D://Work//Alpha///', 'd:\\work\\alpha'],
    ['\\\\Server\\Share\\Alpha\\', '//server/share/alpha'],
  ])('groups equivalent Windows directories %s and %s', (left, right) => {
    expect(sessionWorkspaceIdentity(left)).toBe(sessionWorkspaceIdentity(right))
    expect(resolveSessionProject(session('a', left)).key).toBe(resolveSessionProject(session('b', right)).key)
  })

  it('preserves case for POSIX directories', () => {
    expect(sessionWorkspaceIdentity('/work/Alpha')).not.toBe(sessionWorkspaceIdentity('/work/alpha'))
  })

  it.each([
    ['C:\\', 'c:/', 'C:'],
    ['/', '/', '/'],
    ['\\\\Server\\Share\\', '//server/share', 'Share'],
  ])('retains a root directory %s', (cwd, identity, label) => {
    expect(sessionWorkspaceIdentity(cwd)).toBe(identity)
    expect(sessionWorkspaceLabel(cwd)).toBe(label)
    expect(resolveSessionProject(session('root', cwd)).kind).toBe('directory')
  })
})

describe('session project grouping', () => {
  it('keeps manual groups ahead of directory defaults, even without a directory', () => {
    const first = resolveSessionProject(session('one', 'D:/work/Alpha', '  评审会话  '))
    const second = resolveSessionProject(session('two', '', '评审会话'))
    expect(first).toMatchObject({ label: '评审会话', kind: 'manual' })
    expect(first.key).toBe(second.key)
  })

  it('separates same-name directories and an equally named manual group', () => {
    const groups = groupSessionsByProject([
      session('one', 'D:/work/Alpha'),
      session('two', 'E:/work/Alpha'),
      session('three', 'D:/work/Alpha', 'Alpha'),
    ])
    expect(groups).toHaveLength(3)
    expect(groups.map(group => group.label)).toEqual(['Alpha', 'Alpha', 'Alpha'])
    expect(new Set(groups.map(group => group.key)).size).toBe(3)
  })

  it('only leaves sessions without both a directory and manual group ungrouped', () => {
    const groups = groupSessionsByProject([
      session('known', 'D:/work/Alpha'),
      session('missing', ''),
      session('blank', '   ', '  '),
    ])
    expect(groups).toHaveLength(2)
    expect(groups.at(-1)).toMatchObject({ kind: 'ungrouped', label: '未分组', count: 2 })
    expect(sessionWorkspaceLabel('')).toBe('未识别工作区')
  })

  it('recomputes defaults after a manual group is cleared or the primary directory changes', () => {
    const original = session('one', 'D:/work/Alpha', '评审会话')
    const automatic = resolveSessionProject({ ...original, group: null })
    const moved = resolveSessionProject({ ...original, group: null, cwd: 'D:/work/Beta' })
    expect(automatic).toMatchObject({ kind: 'directory', label: 'Alpha' })
    expect(moved).toMatchObject({ kind: 'directory', label: 'Beta' })
    expect(moved.key).not.toBe(automatic.key)
    expect(original.group).toBe('评审会话')
  })

  it('uses only the primary directory and counts live running sessions', () => {
    const first = Object.freeze({ ...session('one', 'D:/work/Alpha'), projectDirectories: ['E:/Beta'], status: 'RUNNING' as const, live: true, lastSeenAt: 30 })
    const groups = groupSessionsByProject([
      first,
      { ...session('two', 'd:\\work\\alpha'), engine: 'pi', status: 'RUNNING', live: false },
      { ...session('three', '/work/Beta'), lastSeenAt: 20 },
    ])
    expect(groups.map(group => group.label)).toEqual(['Alpha', 'Beta'])
    expect(groups[0]).toMatchObject({ count: 2, running: 1, lastSeenAt: 30 })
    expect(first.group).toBeNull()
  })
})
