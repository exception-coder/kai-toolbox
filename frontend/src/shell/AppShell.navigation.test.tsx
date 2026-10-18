import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { lazy, Suspense, type ComponentType } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'
import { WorkspaceRouter } from './WorkspaceRouter'

const search = vi.hoisted(() => vi.fn())
vi.mock('./commandPaletteBus', () => ({ openCommandPalette: search }))
vi.mock('./DeferredCommandPalette', () => ({ DeferredCommandPalette: () => null }))
vi.mock('./AccountMenu', () => ({ AccountMenu: () => null }))
vi.mock('./PwaInstallPrompt', () => ({ PwaInstallPrompt: () => null }))
vi.mock('@/features/work-assistants/public-api', () => ({ AssistantHost: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('./brand', () => ({ useBrand: () => ({ brand: { appName: 'Forge', tagline: '' } }) }))
vi.mock('./useMockMode', () => ({ useMockMode: () => ({ enabled: false }) }))
vi.mock('./useWindowControlsOverlay', () => ({ useWindowControlsOverlay: () => false }))
vi.mock('./permission', () => ({ useAccessContext: () => ({ roles: ['ADMIN'], permissionCodes: [], superAdmin: true }) }))
vi.mock('./menuVisibility', () => ({ useMenuVisibilitySync: () => {}, useVisibleFeatures: (features: unknown[]) => features }))
vi.mock('./featureRegistry', () => ({
  featureAtPath: () => undefined,
  entryOf: (feature: { entry: string }) => feature.entry,
  features: [{ id: 'current', name: '当前功能', entry: '/current', icon: () => null, requiredPermission: 'menu:current', routes: [] },
    { id: 'slow', name: '稍慢的功能', entry: '/slow', icon: () => null, requiredPermission: 'menu:slow', routes: [] }],
}))

afterEach(() => { cleanup(); search.mockClear(); history.replaceState(null, '', '/') })

function LocationProbe() { return <output data-testid="current-location">{useLocation().pathname}</output> }

function fixture(loader?: () => Promise<{ default: ComponentType }>) {
  const Target = loader ? lazy(loader) : () => <p>目标页面内容</p>
  history.replaceState(null, '', '/current')
  render(<WorkspaceRouter>
    <LocationProbe /><Routes><Route element={<AppShell />}>
      <Route path="/current" element={<p>当前页面内容</p>} />
      <Route path="/slow" element={<Suspense fallback={<p>路由加载中</p>}><Target /></Suspense>} />
      <Route path="/explore" element={<p>产品介绍内容</p>} />
    </Route></Routes>
  </WorkspaceRouter>)
  const trigger = screen.getByRole('button', { name: '打开导航' })
  trigger.focus()
  fireEvent.click(trigger)
  return { trigger, menu: screen.getByRole('dialog', { name: '导航' }) }
}

it('closes the mobile drawer when selecting the current route and restores the opener', async () => {
  const { menu, trigger } = fixture()
  fireEvent.click(within(menu).getByRole('link', { name: '当前功能' }))
  expect(screen.queryByRole('dialog', { name: '导航' })).not.toBeInTheDocument()
  expect(screen.getByTestId('current-location')).toHaveTextContent('/current')
  await vi.waitFor(() => expect(trigger).toHaveFocus())
})

it('closes before a slow route finishes loading and then navigates once', async () => {
  let finish!: (value: { default: ComponentType }) => void
  const loader = vi.fn(() => new Promise<{ default: ComponentType }>(resolve => { finish = resolve }))
  const { menu } = fixture(loader)
  fireEvent.click(within(menu).getByRole('link', { name: '稍慢的功能' }))
  expect(screen.queryByRole('dialog', { name: '导航' })).not.toBeInTheDocument()
  expect(screen.getByTestId('current-location')).toHaveTextContent('/slow')
  expect(screen.getByText('路由加载中')).toBeVisible()
  await act(async () => { finish({ default: () => <p>目标页面内容</p> }) })
  expect(await screen.findByText('目标页面内容')).toBeVisible()
  expect(loader).toHaveBeenCalledOnce()
})

it('closes before opening search so the modal drawer cannot block the command palette', () => {
  const { menu } = fixture()
  fireEvent.click(within(menu).getByRole('button', { name: /搜索/ }))
  expect(screen.queryByRole('dialog', { name: '导航' })).not.toBeInTheDocument()
  expect(search).toHaveBeenCalledOnce()
})

it('provides an explicit close button without navigating', () => {
  const { menu } = fixture()
  fireEvent.click(within(menu).getByRole('button', { name: '关闭导航' }))
  expect(screen.queryByRole('dialog', { name: '导航' })).not.toBeInTheDocument()
  expect(screen.getByTestId('current-location')).toHaveTextContent('/current')
})

it('preserves modified link clicks that open another tab', () => {
  const { menu } = fixture()
  // Prevent JSDOM's unsupported new-window navigation after React has handled the event.
  document.addEventListener('click', event => event.preventDefault(), { once: true })
  fireEvent.click(within(menu).getByRole('link', { name: '稍慢的功能' }), { ctrlKey: true })
  expect(screen.getByRole('dialog', { name: '导航' })).toBeVisible()
})
