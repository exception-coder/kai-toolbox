import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PagePreviewPage } from './PagePreviewPage'
import type { PreviewView } from './api'
const calls = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn(), close: vi.fn(), resume: vi.fn(), input: vi.fn(), resources: vi.fn() }))
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { userId: 1 } }) }))
vi.mock('./api', () => ({ createPreview: calls.create, getPreview: calls.get, closePreview: calls.close, continuePreview: calls.resume,
  previewInput: calls.input, previewResources: calls.resources, previewFrame: async () => new Blob(['frame'], { type: 'image/jpeg' }) }))
const view: PreviewView = { id: 'preview-1', status: 'READY', target: { requestKey: 'stable', origin: 'https://localhost:5173',
  route: '/tools/fore-consult', device: 'phone', scene: 'page' }, targetOrigin: 'https://localhost:5173', account: 'ordinary',
  environment: 'Forge 当前环境', runtimeVersion: '运行版本尚未核验', expiresAt: Date.now() + 600000, viewerPath: '/tools/fore-consult/preview/preview-1' }
let client: QueryClient
const createUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
const revokeUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
beforeEach(() => {
  calls.create.mockReset().mockResolvedValue(view); calls.get.mockReset().mockResolvedValue(view)
  calls.close.mockReset().mockResolvedValue(undefined); calls.resume.mockReset().mockResolvedValue(view); calls.input.mockReset().mockResolvedValue(undefined)
  calls.resources.mockReset().mockResolvedValue([{ id: 'test-app', name: '测试应用', environment: 'TEST', username: 'test-user', baseUrl: 'https://test.example/app' }])
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:preview') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})
afterEach(() => {
  cleanup(); client.clear(); vi.restoreAllMocks()
  if (createUrl) Object.defineProperty(URL, 'createObjectURL', createUrl); else Reflect.deleteProperty(URL, 'createObjectURL')
  if (revokeUrl) Object.defineProperty(URL, 'revokeObjectURL', revokeUrl); else Reflect.deleteProperty(URL, 'revokeObjectURL')
})
function mount(url: string) {
  render(<StrictMode><QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}><Routes>
    <Route path="/tools/fore-consult/preview" element={<PagePreviewPage />} />
    <Route path="/tools/fore-consult/preview/:previewId" element={<PagePreviewPage />} />
  </Routes></MemoryRouter></QueryClientProvider></StrictMode>)
}
it('automatically opens a stable handoff once and uses the current identity by default', async () => {
  mount('/tools/fore-consult/preview?auto=1&requestKey=handoff&route=%2Ftools%2Ffore-consult&device=phone')
  await waitFor(() => expect(calls.create).toHaveBeenCalledOnce())
  expect(calls.create.mock.calls[0][0]).toMatchObject({ requestKey: 'handoff', route: '/tools/fore-consult', device: 'phone', resourceId: undefined })
  expect(await screen.findByText('目标页面已加载')).toBeVisible()
  expect(screen.getByText(/运行版本尚未核验/)).toBeVisible()
})
it('requires explicit takeover before sending clicks and can close the preview', async () => {
  mount('/tools/fore-consult/preview/preview-1')
  const image = await screen.findByRole('img', { name: '目标页面的实时渲染画面' })
  vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 390, height: 844 } as DOMRect)
  fireEvent.click(image, { clientX: 100, clientY: 100 })
  expect(calls.input).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('checkbox', { name: '接管操作' }))
  fireEvent.click(image, { clientX: 100, clientY: 100 })
  expect(calls.input).toHaveBeenCalledWith('preview-1', expect.objectContaining({ type: 'click' }))
  calls.get.mockResolvedValue({ ...view, status: 'CLOSED' })
  fireEvent.click(screen.getByRole('button', { name: '关闭' }))
  expect(await screen.findByText('预览已关闭')).toBeVisible()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})
it('shows an actionable failure without pretending the page is ready', async () => {
  calls.get.mockRejectedValue(new Error('forbidden'))
  mount('/tools/fore-consult/preview/preview-1')
  expect(await screen.findByRole('alert')).toHaveTextContent('读取预览失败')
  expect(screen.getByRole('button', { name: '重试' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '调整预览账号' })).toBeVisible()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

it('continues after manual login without creating another browser context', async () => {
  calls.get.mockResolvedValue({ ...view, status: 'WAITING_LOGIN' })
  mount('/tools/fore-consult/preview/preview-1')
  const resume = await screen.findByRole('button', { name: '继续打开目标页' })
  calls.get.mockResolvedValue(view)
  fireEvent.click(resume)
  expect(await screen.findByText('目标页面已加载')).toBeVisible()
  expect(calls.resume).toHaveBeenCalledExactlyOnceWith('preview-1')
  expect(calls.create).not.toHaveBeenCalled()
})

it('uses a configured runtime account from the handoff without sending credentials', async () => {
  mount('/tools/fore-consult/preview?auto=1&requestKey=account&route=%2Fapp%2Femployees&resourceId=test-app')
  await waitFor(() => expect(calls.create).toHaveBeenCalledOnce())
  expect(calls.create.mock.calls[0][0]).toMatchObject({ resourceId: 'test-app', route: '/app/employees' })
  expect(calls.create.mock.calls[0][0]).not.toHaveProperty('password')
  expect(calls.create.mock.calls[0][0]).not.toHaveProperty('username')
})

it('can change a running preview to a configured application account and close the old context first', async () => {
  mount('/tools/fore-consult/preview/preview-1')
  fireEvent.click(await screen.findByRole('button', { name: '调整预览账号' }))
  await screen.findByRole('option', { name: /测试应用/ })
  expect(screen.getByRole('link', { name: '配置运行账号' })).toHaveAttribute('href', '/tools/reqpool/resources?view=accounts')
  fireEvent.change(screen.getByLabelText('访问账号'), { target: { value: 'test-app' } })
  fireEvent.change(screen.getByLabelText('目标路由'), { target: { value: '/app/employees' } })
  fireEvent.click(screen.getByRole('button', { name: '登录并打开页面' }))
  await waitFor(() => expect(calls.create).toHaveBeenCalledOnce())
  expect(calls.close).toHaveBeenCalledExactlyOnceWith('preview-1')
  expect(calls.create.mock.calls[0][0]).toMatchObject({ resourceId: 'test-app', route: '/app/employees' })
  expect(calls.close.mock.invocationCallOrder[0]).toBeLessThan(calls.create.mock.invocationCallOrder[0])
})

it('manual setup does not start a browser until submitted', () => {
  mount('/tools/fore-consult/preview')
  expect(screen.getByLabelText('访问账号')).toBeVisible()
  expect(calls.create).not.toHaveBeenCalled()
})
