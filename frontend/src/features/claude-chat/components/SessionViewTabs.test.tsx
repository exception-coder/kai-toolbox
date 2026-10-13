import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SessionViewTabs } from './SessionViewTabs'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('keeps frequent views on the desktop and moves trajectory and sites into more', async () => {
  const onSelect = vi.fn()
  render(<SessionViewTabs view="trajectory" onSelect={onSelect} hasSession siteCount={2}
    documentTitle="需求" pendingReviewCount={1} />)
  const nav = within(screen.getByRole('navigation', { name: '会话视图' }))
  expect(nav.getByRole('button', { name: '对话' })).toBeInTheDocument()
  expect(nav.getByRole('button', { name: '用量' })).toBeInTheDocument()
  expect(nav.queryByRole('button', { name: '轨迹' })).not.toBeInTheDocument()
  expect(nav.queryByRole('button', { name: /站点/ })).not.toBeInTheDocument()
  expect(nav.queryByRole('button', { name: /数据库|SQL/ })).not.toBeInTheDocument()
  const trigger = screen.getByRole('button', { name: '更多会话视图，当前轨迹' })
  expect(trigger).toHaveAttribute('aria-current', 'page')
  expect(screen.queryByLabelText('有待处理视图')).not.toBeInTheDocument()
  trigger.focus()
  fireEvent.click(trigger)
  const menu = within(screen.getByRole('group', { name: '选择会话视图' }))
  expect(menu.getByRole('button', { name: '沟通流水' })).toBeInTheDocument()
  expect(menu.queryByRole('button', { name: '用量' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '轨迹' })).toHaveAttribute('aria-current', 'page')
  fireEvent.click(screen.getByRole('button', { name: '站点 2' }))
  expect(onSelect).toHaveBeenCalledExactlyOnceWith('sites')
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(screen.queryByRole('group', { name: '选择会话视图' })).not.toBeInTheDocument()
})

it('retains mobile-only views and dismisses the menu when returning to desktop', async () => {
  const listeners = new Set<() => void>()
  const media = { matches: true, addEventListener: (_event: string, callback: () => void) => listeners.add(callback),
    removeEventListener: (_event: string, callback: () => void) => listeners.delete(callback) }
  vi.stubGlobal('matchMedia', vi.fn(() => media))
  const onSelect = vi.fn()
  render(<SessionViewTabs view="review" onSelect={onSelect} hasSession siteCount={0}
    documentTitle="需求" pendingReviewCount={2} />)
  const trigger = screen.getByRole('button', { name: '更多会话视图，当前评审 2' })
  expect(trigger).toHaveAttribute('aria-current', 'page')
  expect(screen.getByLabelText('有待处理视图')).toBeInTheDocument()
  fireEvent.click(trigger)
  const menu = within(screen.getByRole('group', { name: '选择会话视图' }))
  expect(menu.getByRole('button', { name: '用量' })).toBeInTheDocument()
  expect(menu.getByRole('button', { name: '文档' })).toBeInTheDocument()
  expect(menu.getByRole('button', { name: /评审 2/ })).toHaveAttribute('aria-current', 'page')
  act(() => { media.matches = false; listeners.forEach(callback => callback()) })
  await waitFor(() => expect(screen.queryByRole('group', { name: '选择会话视图' })).not.toBeInTheDocument())
  expect(screen.getByRole('button', { name: '更多会话视图' })).not.toHaveAttribute('aria-current')
  expect(onSelect).not.toHaveBeenCalled()
  fireEvent.click(trigger)
  fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' })
  await waitFor(() => expect(trigger).toHaveFocus())
})

it('keeps the board available before a session is selected', () => {
  render(<SessionViewTabs view="board" onSelect={vi.fn()} hasSession={false} siteCount={0} />)
  expect(screen.getByRole('button', { name: '会话看板' })).toHaveAttribute('aria-current', 'page')
  expect(screen.queryByRole('button', { name: '更多会话视图' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '对话' })).not.toBeInTheDocument()
})
