import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { InlinePagePreview } from './InlinePagePreview'
import type { PreviewTarget, PreviewView } from './api'

const calls = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn(), close: vi.fn(), resources: vi.fn(), frame: vi.fn(), input: vi.fn() }))
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { userId: 1 } }) }))
vi.mock('./api', () => ({ createPreview: calls.create, getPreview: calls.get, closePreview: calls.close, previewResources: calls.resources,
  previewFrame: calls.frame, previewInput: calls.input, continuePreview: vi.fn() }))
let client: QueryClient
let intersect: (items: { isIntersecting: boolean }[]) => void
let views: Map<string, PreviewView>
const createUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
const revokeUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
const entry = (device = 'phone', extra = '') => ({ path: `/tools/fore-consult/preview?auto=1&requestKey=delivery-${device}&route=%2Ftools%2Fclaude-chat&device=${device}${extra}`, label: device === 'phone' ? '手机预览' : '桌面预览' })
function view(target: PreviewTarget, id = 'browser'): PreviewView {
  return { id, target, status: 'READY', targetOrigin: 'https://localhost:5173', account: 'viewer', environment: 'TEST', runtimeVersion: '未核验', expiresAt: Date.now() + 600000, viewerPath: `/tools/fore-consult/preview/${id}` }
}
beforeEach(() => {
  views = new Map()
  calls.create.mockReset().mockImplementation(async (target: PreviewTarget) => { const result = view(target, `browser-${target.device}`); views.set(result.id, result); return result })
  calls.get.mockReset().mockImplementation(async (id: string) => views.get(id))
  calls.close.mockReset().mockResolvedValue(undefined)
  calls.resources.mockReset().mockResolvedValue([])
  calls.frame.mockReset().mockResolvedValue(new Blob(['frame'], { type: 'image/jpeg' }))
  calls.input.mockReset()
  vi.stubGlobal('IntersectionObserver', class { constructor(callback: typeof intersect) { intersect = callback } observe() {} disconnect() {} })
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:frame') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})
afterEach(() => {
  cleanup(); client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear()
  if (createUrl) Object.defineProperty(URL, 'createObjectURL', createUrl); else Reflect.deleteProperty(URL, 'createObjectURL')
  if (revokeUrl) Object.defineProperty(URL, 'revokeObjectURL', revokeUrl); else Reflect.deleteProperty(URL, 'revokeObjectURL')
})
function mount(entries = [entry()]) {
  const node = (items = entries) => <StrictMode><QueryClientProvider client={client}><InlinePagePreview entries={items} /></QueryClientProvider></StrictMode>
  return { ...render(node()), node }
}
it('opens only when visible, keeps one context across updates and fullscreen, pauses offscreen and closes its own context', async () => {
  const mounted = mount()
  expect(calls.create).not.toHaveBeenCalled()
  act(() => intersect([{ isIntersecting: true }]))
  expect(await screen.findByRole('img', { name: '目标页面的实时渲染画面' })).toBeVisible()
  expect(calls.create).toHaveBeenCalledOnce()
  expect(calls.create.mock.calls[0][0].route).toBe('/tools/claude-chat?__forge_inline_preview=1')
  expect(calls.create.mock.calls[0][0].requestKey).not.toBe('delivery-phone')
  fireEvent.click(screen.getByRole('img'))
  expect(calls.input).not.toHaveBeenCalled()
  mounted.rerender(mounted.node([{ ...entry() }]))
  expect(calls.create).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: '全屏查看 手机预览' }))
  expect(await screen.findByRole('dialog')).toBeVisible()
  expect(calls.create).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: '关闭页面预览' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(calls.close).not.toHaveBeenCalled()
  act(() => intersect([{ isIntersecting: false }]))
  expect(calls.frame.mock.calls.at(-1)?.[1].aborted).toBe(true)
  mounted.unmount()
  await waitFor(() => expect(calls.close).toHaveBeenCalledExactlyOnceWith('browser-phone'))
})
it('selects one device at a time and disposes the previous owned browser', async () => {
  mount([entry(), entry('desktop')])
  act(() => intersect([{ isIntersecting: true }]))
  await screen.findByRole('img')
  fireEvent.click(screen.getByRole('button', { name: '桌面预览' }))
  await waitFor(() => expect(calls.create).toHaveBeenCalledTimes(2))
  expect(calls.create.mock.calls[1][0].device).toBe('desktop')
  expect(calls.close).toHaveBeenCalledWith('browser-phone')
})
it('keeps production confirmation before launching a registered production resource', async () => {
  calls.resources.mockResolvedValue([{ id: 'prod', name: '生产', environment: 'PROD', username: 'operator' }])
  mount([entry('phone', '&resourceId=prod')])
  act(() => intersect([{ isIntersecting: true }]))
  const confirmation = await screen.findByRole('checkbox', { name: '确认使用生产账号打开预览' })
  expect(calls.create).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '登录并打开页面' })).toBeDisabled()
  fireEvent.click(confirmation)
  fireEvent.click(screen.getByRole('button', { name: '登录并打开页面' }))
  await waitFor(() => expect(calls.create).toHaveBeenCalledOnce())
  expect(calls.create.mock.calls[0][0]).toMatchObject({ resourceId: 'prod', productionConfirmed: true, route: '/tools/claude-chat' })
})
it('closes late owned creation after unmount', async () => {
  let finish!: (value: PreviewView) => void
  calls.create.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const mounted = mount()
  act(() => intersect([{ isIntersecting: true }]))
  await waitFor(() => expect(calls.create).toHaveBeenCalledOnce())
  mounted.unmount()
  await act(async () => finish(view(calls.create.mock.calls[0][0], 'late')))
  expect(calls.close).toHaveBeenCalledExactlyOnceWith('late')
})
it('does not close a borrowed preview when its message unmounts', async () => {
  views.set('borrowed', view({ requestKey: 'borrowed', origin: window.location.origin, route: '/tools/claude-chat', device: 'phone', scene: 'page' }, 'borrowed'))
  const mounted = mount([{ path: '/tools/fore-consult/preview/borrowed', label: '已有预览' }])
  act(() => intersect([{ isIntersecting: true }]))
  await screen.findByRole('img')
  expect(calls.create).not.toHaveBeenCalled()
  mounted.unmount()
  expect(calls.close).not.toHaveBeenCalled()
})
it('rejects incomplete or cross-origin entries without opening a browser', async () => {
  mount([{ path: 'https://untrusted.example/tools/fore-consult/preview?auto=1&route=/tools/claude-chat', label: '外部地址' }])
  act(() => intersect([{ isIntersecting: true }]))
  expect(await screen.findByRole('alert')).toHaveTextContent('入口不完整或不可用')
  expect(calls.create).not.toHaveBeenCalled()
})
it('does not start an unknown resource or substitute a different account', async () => {
  mount([entry('phone', '&resourceId=missing')])
  act(() => intersect([{ isIntersecting: true }]))
  await screen.findByText(/暂无可自动登录的应用/)
  expect(calls.create).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '登录并打开页面' })).toBeDisabled()
})
it('shows creation failure without retry loops and reuses the same request key for an explicit retry', async () => {
  calls.create.mockRejectedValueOnce(new Error('浏览器暂不可用'))
  mount()
  act(() => intersect([{ isIntersecting: true }]))
  expect(await screen.findByRole('alert')).toHaveTextContent('浏览器暂不可用')
  expect(calls.create).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: '登录并打开页面' }))
  await screen.findByRole('img')
  expect(calls.create).toHaveBeenCalledTimes(2)
  expect(calls.create.mock.calls[1][0].requestKey).toBe(calls.create.mock.calls[0][0].requestKey)
})
