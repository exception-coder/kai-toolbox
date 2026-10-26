import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { Markdown } from './Markdown'

const calls = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn(), close: vi.fn(), openLocal: vi.fn() }))
vi.mock('../api', () => ({ openSessionLocalPath: calls.openLocal }))
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { userId: 1 } }) }))
vi.mock('@/features/browser-request/preview/api', () => ({ createPreview: calls.create, getPreview: calls.get,
  closePreview: calls.close, previewResources: async () => [{ id: 'test-account', name: '测试应用', environment: 'TEST', username: 'test-user' }], continuePreview: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('opens desktop preview in context, preserves full entry and disposes it on session change', async () => {
  const target = { requestKey: 'delivery', route: '/app/users', device: 'desktop', scene: 'page', resourceId: 'test-account' }
  const data = { id: 'browser', status: 'AUTHENTICATING', target, targetOrigin: 'https://test.example', environment: 'TEST', account: 'test-user' }
  calls.create.mockResolvedValue(data); calls.get.mockResolvedValue(data); calls.close.mockResolvedValue(undefined)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const text = '[桌面预览](/tools/fore-consult/preview?auto=1&requestKey=delivery&route=%2Fapp%2Fusers&resourceId=test-account)'
  const node = (sessionId: string, suffix = '') => <QueryClientProvider client={client}><Markdown text={text + suffix} sessionId={sessionId} /></QueryClientProvider>
  const view = render(node('one'))
  let trigger = screen.getByRole('link', { name: '桌面预览' })
  const location = window.location.href
  fireEvent.click(trigger)
  await act(() => vi.dynamicImportSettled())
  expect(await screen.findByText('正在登录应用')).toBeVisible()
  expect(calls.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ...target, requestKey: expect.any(String) }))
  expect(calls.openLocal).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '全屏页面预览' }))
  expect(screen.getByRole('dialog')).toHaveClass('inset-0')
  expect(calls.create).toHaveBeenCalledOnce()
  view.rerender(node('one', '\n\n流式新增内容'))
  trigger = screen.getByRole('link', { name: '桌面预览', hidden: true })
  fireEvent.click(screen.getByRole('button', { name: '关闭页面预览' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(trigger).toHaveFocus(); expect(window.location.href).toBe(location)
  expect(calls.close).toHaveBeenCalledWith('browser')
  fireEvent.click(trigger)
  await screen.findByRole('dialog')
  await waitFor(() => expect(calls.create).toHaveBeenCalledTimes(2))
  expect(calls.create.mock.calls[1][0].requestKey).not.toBe(calls.create.mock.calls[0][0].requestKey)
  view.rerender(node('two'))
  await waitFor(() => expect(calls.close).toHaveBeenCalledTimes(2))
  expect(screen.queryByRole('dialog')).toBeNull()
  client.clear()
})

it('closes a late browser creation result after the modal has already closed', async () => {
  let finish!: (value: unknown) => void
  calls.create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  calls.close.mockResolvedValue(undefined)
  const client = new QueryClient()
  render(<QueryClientProvider client={client}><Markdown text="[预览](/tools/fore-consult/preview?auto=1&requestKey=late&resourceId=test-account&route=%2Fapp)" sessionId="one" /></QueryClientProvider>)
  fireEvent.click(screen.getByRole('link', { name: '预览' }))
  await act(() => vi.dynamicImportSettled())
  await waitFor(() => expect(calls.create).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button', { name: '关闭页面预览' }))
  await act(async () => { finish({ id: 'late-browser', status: 'STARTING' }) })
  await waitFor(() => expect(calls.close).toHaveBeenCalledExactlyOnceWith('late-browser'))
  expect(screen.queryByRole('dialog')).toBeNull()
  client.clear()
})
