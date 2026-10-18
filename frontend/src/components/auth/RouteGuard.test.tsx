import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { HomePage } from '@/shell/HomePage'
import type { FeatureManifest } from '@/shell/types'
import { RouteGuard } from './RouteGuard'

const auth = vi.hoisted(() => ({
  user: null as { userId: number; username: string; roles: string[] } | null,
  permissionCodes: [] as string[],
  superAdmin: false,
  login: vi.fn(),
  developmentAccess: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ useAuth: () => auth, login: auth.login }))
vi.mock('@/features/reqpool/api', () => ({ getDevelopmentAccess: auth.developmentAccess }))
vi.mock('@/shell/brand', () => ({
  BRAND_DEFAULTS: { appName: 'Forge', tagline: '工作台' },
  useBrand: () => ({ brand: { appName: 'Forge', tagline: '工作台' } }),
}))
vi.mock('@/shell/BrandLogo', () => ({ BrandLogo: () => null }))
vi.mock('@/shell/menuVisibility', () => ({ useVisibleFeatures: (features: unknown[]) => features }))
vi.mock('@/shell/featureRegistry', () => ({
  entryOf: (feature: { entry: string }) => feature.entry,
  features: [{ id: 'fore-consult', name: '业务系统咨询', entry: '/tools/fore-consult',
    requiredPermission: 'menu:fore-consult', icon: () => null }],
}))

const feature: FeatureManifest = {
  id: 'fore-consult', name: '业务系统咨询', entry: '/tools/fore-consult',
  requiredPermission: 'menu:fore-consult', icon: () => null, routes: [],
}
const member = { userId: 1, username: '同事', roles: [] }

beforeEach(() => {
  auth.user = null
  auth.permissionCodes = []
  auth.superAdmin = false
  auth.login.mockReset()
  auth.developmentAccess.mockReset()
})
afterEach(cleanup)

function LocationProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return <><output data-testid="location">{location.pathname}{location.search}{location.hash}</output>
    <button onClick={() => navigate(-1)}>浏览器返回</button></>
}

function fixture(target = feature, path = target.entry!, previous?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const clear = vi.spyOn(client, 'clear')
  const content = vi.fn(() => <p>受保护内容</p>)
  const ProtectedContent = content
  const tree = () => <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={previous ? [previous, path] : [path]}>
      <LocationProbe /><Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/prior" element={<p>来源页面</p>} />
        <Route path={target.entry!} element={<RouteGuard feature={target}><ProtectedContent /></RouteGuard>} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>
  const view = render(tree())
  return { content, clear, refresh: () => view.rerender(tree()) }
}

it('replaces an unauthenticated deep link with the home page without mounting protected content', async () => {
  const { content } = fixture(feature, '/tools/fore-consult?sessionId=example#message', '/prior')
  expect(await screen.findByRole('heading', { name: '登录工作台' })).toBeVisible()
  expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
  expect(content).not.toHaveBeenCalled()
  expect(screen.queryByText('无权访问')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '浏览器返回' }))
  expect(await screen.findByText('来源页面')).toBeVisible()
})

it('does not call scoped requirement authorization before login', () => {
  fixture({ ...feature, id: 'claude-chat', entry: '/tools/claude-chat', requiredPermission: 'menu:claude-chat' },
    '/tools/claude-chat?prdSessionId=example')
  expect(auth.developmentAccess).not.toHaveBeenCalled()
  expect(screen.getByRole('heading', { name: '登录工作台' })).toBeVisible()
})

it('opens the existing login dialog on home and shows authorized modules after login', async () => {
  auth.login.mockImplementation(async () => {
    auth.user = member
    auth.permissionCodes = ['menu:fore-consult']
    return member
  })
  const { clear, refresh } = fixture()
  fireEvent.click(screen.getByRole('button', { name: '登录' }))
  expect(screen.getByRole('dialog')).toBeVisible()
  fireEvent.change(screen.getByPlaceholderText('用户名'), { target: { value: '同事' } })
  fireEvent.change(screen.getByPlaceholderText('密码'), { target: { value: 'example-password' } })
  fireEvent.click(screen.getByRole('button', { name: '登录' }))
  await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  refresh()
  expect(auth.login).toHaveBeenCalledWith('同事', 'example-password')
  expect(clear).toHaveBeenCalledOnce()
  expect(screen.getByRole('link', { name: /业务系统咨询/ })).toBeVisible()
  expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
})

it('keeps home usable when login fails or is cancelled', async () => {
  auth.login.mockRejectedValue(new Error('账号或密码错误'))
  fixture()
  fireEvent.click(screen.getByRole('button', { name: '登录' }))
  fireEvent.change(screen.getByPlaceholderText('用户名'), { target: { value: '同事' } })
  fireEvent.change(screen.getByPlaceholderText('密码'), { target: { value: 'wrong' } })
  fireEvent.click(screen.getByRole('button', { name: '登录' }))
  expect(await screen.findByText('账号或密码错误')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await vi.waitFor(() => expect(screen.getByRole('button', { name: '登录' })).toHaveFocus())
})

it('keeps an authorized deep link and its query and hash unchanged', () => {
  auth.user = member
  auth.permissionCodes = ['menu:fore-consult']
  fixture(feature, '/tools/fore-consult?sessionId=example#message')
  expect(screen.getByText('受保护内容')).toBeVisible()
  expect(screen.getByTestId('location')).toHaveTextContent('/tools/fore-consult?sessionId=example#message')
})

it('blocks a logged-in user without permission and offers home recovery', async () => {
  auth.user = member
  const { content } = fixture()
  expect(screen.getByText('无权访问')).toBeVisible()
  expect(screen.getByText('当前账号没有该模块的访问权限，请联系管理员开通。')).toBeVisible()
  expect(content).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('link', { name: '返回工作台首页' }))
  expect(await screen.findByText('暂无可用功能，请联系管理员确认模块权限与菜单配置。')).toBeVisible()
})

it('retains scoped requirement access for logged-in users', async () => {
  auth.user = member
  auth.developmentAccess.mockResolvedValue({})
  fixture({ ...feature, id: 'claude-chat', entry: '/tools/claude-chat', requiredPermission: 'menu:claude-chat' },
    '/tools/claude-chat?prdSessionId=example')
  expect(await screen.findByText('受保护内容')).toBeVisible()
  expect(auth.developmentAccess).toHaveBeenCalledWith('example')
})

it('retains scoped denial when the requirement check fails', async () => {
  auth.user = member
  auth.developmentAccess.mockRejectedValue(new Error('无需求权限'))
  const { content } = fixture({ ...feature, id: 'claude-chat', entry: '/tools/claude-chat', requiredPermission: 'menu:claude-chat' },
    '/tools/claude-chat?prdSessionId=example')
  await vi.waitFor(() => expect(auth.developmentAccess).toHaveBeenCalledOnce())
  expect(await screen.findByRole('link', { name: '返回工作台首页' })).toBeVisible()
  expect(content).not.toHaveBeenCalled()
})

it('retains redirection to an authorized control mode', async () => {
  auth.user = member
  auth.permissionCodes = ['mode:usable']
  fixture({ ...feature, controlPermissions: { parameter: 'mode', modes: { usable: 'mode:usable' } } })
  expect(await screen.findByText('受保护内容')).toBeVisible()
  expect(screen.getByTestId('location')).toHaveTextContent('/tools/fore-consult?mode=usable')
})
