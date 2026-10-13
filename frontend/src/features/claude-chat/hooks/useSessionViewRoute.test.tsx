import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { NavigateFunction } from 'react-router-dom'
import type { SessionView } from '../components/SessionViewTabs'
import { useSessionViewRoute } from './useSessionViewRoute'

afterEach(cleanup)
it('consumes incoming communication links without the previous view clearing the record target', () => {
  const navigate = vi.fn(), setView = vi.fn()
  const options = { pathname: '/tools/claude-chat', search: '?sessionId=a', view: 'conversation' as SessionView, setView, navigate: navigate as NavigateFunction }
  const ui = renderHook(props => useSessionViewRoute(props), { initialProps: options })
  const linked = { ...options, search: '?sessionId=b&view=communications&recordId=record-b' }
  ui.rerender(linked)
  expect(setView).toHaveBeenCalledExactlyOnceWith('communications')
  expect(navigate).not.toHaveBeenCalled()
  ui.rerender({ ...linked, view: 'communications' })
  expect(navigate).not.toHaveBeenCalled()
})
it('clears only view and record parameters when explicitly leaving a linked view', () => {
  const navigate = vi.fn(), setView = vi.fn()
  const options = { pathname: '/tools/claude-chat', search: '?sessionId=a&view=communications&recordId=record-a&mode=single', view: 'communications' as SessionView, setView, navigate: navigate as NavigateFunction }
  const ui = renderHook(props => useSessionViewRoute(props), { initialProps: options })
  ui.rerender({ ...options, view: 'conversation' })
  expect(navigate).toHaveBeenCalledExactlyOnceWith({ pathname: options.pathname, search: 'sessionId=a&mode=single' }, { replace: true })
  expect(setView).not.toHaveBeenCalled()
})
