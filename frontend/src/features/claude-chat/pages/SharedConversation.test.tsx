import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { readWorkbenchTheme, setWorkbenchTheme } from '../lib/workbenchTheme'
import { SharedConversation } from './SharedConversation'

const runtime = vi.hoisted(() => ({ activate: vi.fn(), chat: null as unknown }))
vi.mock('../runtime/ChatRuntimeContext', () => ({ useChatRuntime: () => runtime }))
vi.mock('../sessionSharingApi', async importOriginal => ({
  ...(await importOriginal<typeof import('../sessionSharingApi')>()),
  getSharedSession: async (id: string) => ({ id, title: '共享测试会话', collaborate: true }),
}))

afterEach(() => { cleanup(); runtime.chat = null; localStorage.clear(); vi.unstubAllGlobals() })

it.each([null, 'tokyo-night'] as const)('only overrides global appearance for a saved theme (%s)', async (savedTheme) => {
  if (savedTheme) setWorkbenchTheme(savedTheme)
  render(<MemoryRouter><QueryClientProvider client={new QueryClient()}>
    <SharedConversation sessionId="shared-theme-default" />
  </QueryClientProvider></MemoryRouter>)
  expect(await screen.findByRole('heading', { name: '共享测试会话' })).toBeVisible()
  expect(document.documentElement.getAttribute('data-workbench-theme')).toBe(savedTheme)
})

it('uses the saved workbench appearance and updates that preference from the shared page', async () => {
  setWorkbenchTheme('atelier-paper', undefined, 0.35)
  const view = render(<MemoryRouter><QueryClientProvider client={new QueryClient()}>
    <SharedConversation sessionId="shared-theme-test" />
  </QueryClientProvider></MemoryRouter>)
  expect(await screen.findByRole('heading', { name: '共享测试会话' })).toBeVisible()
  const root = document.documentElement
  expect(root).toHaveAttribute('data-workbench-theme', 'atelier-paper')
  expect(root.style.getPropertyValue('--wb-material-strength')).toBe('0.35')
  const trigger = screen.getByRole('button', { name: '更多共享会话选项' })
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: '工作台主题' }))
  expect(screen.getByRole('dialog', { name: '工作台主题' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '恢复默认外观' }))
  expect(readWorkbenchTheme()).toBe('inherit')
  expect(root).not.toHaveAttribute('data-workbench-theme')
  fireEvent.click(screen.getByRole('button', { name: '关闭主题设置' }))
  await waitFor(() => expect(trigger).toHaveFocus())
  view.unmount()
})

it.each([false, true])('uses the normal submit path on PC (running=%s)', async (running) => {
  const { input, send, enqueue } = await renderComposer(running)
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(running ? enqueue : send).toHaveBeenCalledExactlyOnceWith('继续检查', [])
  expect(running ? send : enqueue).not.toHaveBeenCalled()
  expect(input).toHaveValue('')
})

it('leaves Shift+Enter, IME confirmation and touch keyboard Enter to the editor', async () => {
  const { input, send, enqueue } = await renderComposer(false)
  expect(fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })).toBe(true)
  expect(fireEvent.keyDown(input, { key: 'Enter', isComposing: true })).toBe(true)
  expect(fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })).toBe(true)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(true)
  expect(send).not.toHaveBeenCalled()
  expect(enqueue).not.toHaveBeenCalled()
  expect(input).toHaveValue('继续检查')
})

it('hides history and actions when the shared connection loses access', async () => {
  runtime.chat = { sessionId: 'revoked', state: 'error', collaborationAccessLost: true,
    items: [{ kind: 'assistant', id: 'old', text: '撤回后不可显示' }] }
  render(<MemoryRouter><QueryClientProvider client={new QueryClient()}>
    <SharedConversation sessionId="revoked" />
  </QueryClientProvider></MemoryRouter>)
  expect(await screen.findByRole('alert')).toHaveTextContent('请确认登录账号')
  expect(screen.getByText('无访问权限')).toBeVisible()
  expect(screen.queryByText('撤回后不可显示')).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})

async function renderComposer(running: boolean) {
  const send = vi.fn(), enqueue = vi.fn()
  runtime.chat = { sessionId: 'shared-keyboard', state: 'ready', running, items: [], queued: [], send, enqueue }
  render(<MemoryRouter><QueryClientProvider client={new QueryClient()}>
    <SharedConversation sessionId="shared-keyboard" />
  </QueryClientProvider></MemoryRouter>)
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  const input = await screen.findByRole('textbox', { name: '消息输入' })
  expect(screen.getByText('共享会话 · 可回复')).toBeVisible()
  expect(input).toHaveAttribute('rows', '1')
  fireEvent.change(input, { target: { value: '继续检查' } })
  return { input, send, enqueue }
}
