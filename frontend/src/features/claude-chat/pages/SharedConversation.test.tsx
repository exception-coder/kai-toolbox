import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { readWorkbenchTheme, setWorkbenchTheme } from '../lib/workbenchTheme'
import { SharedConversation } from './SharedConversation'

vi.mock('../runtime/ChatRuntimeContext', () => ({ useChatRuntime: () => ({ activate: () => {}, chat: null }) }))
vi.mock('../sessionSharingApi', () => ({ getSharedSession: async () => ({ title: '共享测试会话' }) }))

afterEach(() => { cleanup(); localStorage.clear() })

it('uses the saved workbench appearance and updates that preference from the shared page', async () => {
  setWorkbenchTheme('atelier-paper', undefined, 0.35)
  const view = render(<MemoryRouter><QueryClientProvider client={new QueryClient()}>
    <SharedConversation sessionId="shared-theme-test" />
  </QueryClientProvider></MemoryRouter>)
  expect(await screen.findByRole('heading', { name: '共享测试会话' })).toBeVisible()
  const root = document.documentElement
  expect(root).toHaveAttribute('data-workbench-theme', 'atelier-paper')
  expect(root.style.getPropertyValue('--wb-material-strength')).toBe('0.35')
  const trigger = screen.getByRole('button', { name: '工作台主题' })
  fireEvent.click(trigger)
  expect(screen.getByRole('dialog', { name: '工作台主题' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '恢复默认外观' }))
  expect(readWorkbenchTheme()).toBe('inherit')
  expect(root).not.toHaveAttribute('data-workbench-theme')
  fireEvent.click(screen.getByRole('button', { name: '关闭主题设置' }))
  await waitFor(() => expect(trigger).toHaveFocus())
  view.unmount()
})
