import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useRememberedProjects } from './useRememberedProjects'

const auth = vi.hoisted(() => ({ user: { userId: 7 } as { userId: number } | null }))
vi.mock('@/lib/auth', () => ({ useAuth: () => auth }))
beforeEach(() => { localStorage.clear(); auth.user = { userId: 7 } })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('restores choices after remount and asynchronous catalog loading, excluding unavailable IDs', () => {
  const first = renderHook(() => useRememberedProjects('weekly', ['erp', 'scm']))
  act(() => first.result.current[1](['erp', 'scm']))
  first.unmount()
  const next = renderHook(({ available }) => useRememberedProjects('weekly', available), { initialProps: { available: [] as string[] } })
  expect(next.result.current[0]).toEqual([])
  next.rerender({ available: ['erp'] })
  expect(next.result.current[0]).toEqual(['erp'])
  act(() => next.result.current[1]([]))
  next.unmount()
  expect(renderHook(() => useRememberedProjects('weekly', ['erp'])).result.current[0]).toEqual([])
})

it('isolates accounts and assistant types without saving any resource input', () => {
  const weekly = renderHook(() => useRememberedProjects('weekly', ['erp', 'scm']))
  act(() => weekly.result.current[1](['erp']))
  const resource = renderHook(() => useRememberedProjects('resources', ['erp', 'scm']))
  expect(resource.result.current[0]).toEqual([])
  act(() => resource.result.current[1](['scm']))
  auth.user = { userId: 8 }; weekly.rerender()
  expect(weekly.result.current[0]).toEqual([])
  act(() => weekly.result.current[1](['scm']))
  auth.user = { userId: 7 }; weekly.rerender()
  expect(weekly.result.current[0]).toEqual(['erp'])
  expect(JSON.parse(localStorage.getItem('forge:work-assistants:projects:7:resources:v1')!)).toEqual(['scm'])
  auth.user = null; weekly.rerender()
  expect(weekly.result.current[0]).toEqual([])
})

it('tolerates malformed or blocked storage and limits choices to valid project IDs', () => {
  localStorage.setItem('forge:work-assistants:projects:7:weekly:v1', '{broken')
  const form = renderHook(() => useRememberedProjects('weekly', ['a', 'b', 'c', 'd', 'e', 'f']))
  expect(form.result.current[0]).toEqual([])
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disabled') })
  act(() => form.result.current[1](['missing', 'a', 'a', 'b', 'c', 'd', 'e', 'f']))
  expect(form.result.current[0]).toEqual(['a', 'b', 'c', 'd', 'e'])
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('disabled') })
  expect(renderHook(() => useRememberedProjects('resources', ['a'])).result.current[0]).toEqual([])
})
