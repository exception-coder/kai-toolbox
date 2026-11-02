import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { NavigateFunction } from 'react-router-dom'
import type { SessionView } from '../components/SessionViewTabs'
import { useSessionViewRoute } from './useSessionViewRoute'

afterEach(cleanup)
it('opens the existing session board without routing to supervision or a planning detail', () => {
  const navigate = vi.fn(), setView = vi.fn()
  const options = { pathname: '/tools/claude-chat', search: '?view=conversation', view: 'conversation' as SessionView, setView, navigate: navigate as NavigateFunction }
  const ui = renderHook(props => useSessionViewRoute(props), { initialProps: options })
  ui.rerender({ ...options, search: '?view=board' })
  expect(setView).toHaveBeenCalledExactlyOnceWith('board')
  expect(navigate).not.toHaveBeenCalled()
})
it('opens the exact planning view and keeps its change identifier until leaving', () => {
  const navigate = vi.fn(), setView = vi.fn()
  const options = { pathname: '/tools/claude-chat', search: '?view=conversation', view: 'conversation' as SessionView, setView, navigate: navigate as NavigateFunction }
  const ui = renderHook(props => useSessionViewRoute(props), { initialProps: options })
  const linked = { ...options, search: '?view=autopilot_detail&changeId=plan-a' }
  ui.rerender(linked)
  expect(setView).toHaveBeenCalledExactlyOnceWith('autopilot_detail')
  expect(navigate).not.toHaveBeenCalled()
  ui.rerender({ ...linked, view: 'autopilot_detail' })
  ui.rerender({ ...linked, view: 'conversation' })
  expect(navigate).toHaveBeenCalledWith({ pathname: options.pathname, search: '' }, { replace: true })
})
it('returns a quick-board selection to conversation without deleting its session target', () => {
  const navigate = vi.fn(), setView = vi.fn()
  const options = { pathname: '/tools/claude-chat', search: '?view=supervision', view: 'supervision' as SessionView, setView, navigate: navigate as NavigateFunction }
  const ui = renderHook(props => useSessionViewRoute(props), { initialProps: options })
  ui.rerender({ ...options, search: '?sessionId=chosen&view=conversation' })
  expect(setView).toHaveBeenCalledExactlyOnceWith('conversation')
  expect(navigate).not.toHaveBeenCalled()
})
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
