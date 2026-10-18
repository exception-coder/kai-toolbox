import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement, lazy, type ReactNode } from 'react'
import { Link, MemoryRouter, Outlet } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'

const pending = vi.hoisted(() => ({ finishTool: () => {}, finishShowcase: () => {} }))
vi.mock('@/shell/featureRegistry', () => {
  const tool = lazy(() => new Promise<{ default: () => ReactNode }>(resolve => {
    pending.finishTool = () => resolve({ default: () => createElement('p', null, '工具真实内容') })
  }))
  const showcase = lazy(() => new Promise<{ default: () => ReactNode }>(resolve => {
    pending.finishShowcase = () => resolve({ default: () => createElement('p', null, '展示真实内容') })
  }))
  const features = [
    { id: 'tool', name: '待加载工具', routes: [{ path: '/tool', element: createElement(tool) }] },
    { id: 'showcase', name: '待加载展示', layout: 'showcase', routes: [{ path: '/showcase', element: createElement(showcase) }] },
  ]
  return { features, featureAtPath: (path: string) => features.find(feature => feature.routes[0].path === path) }
})
vi.mock('@/shell/AppShell', () => ({ AppShell: () => <><nav><Link to="/tool">工具入口</Link></nav><Outlet /></> }))
vi.mock('@/shell/HomePage', () => ({ HomePage: () => <p>工作台首页</p> }))
vi.mock('@/shell/useWindowControlsOverlay', () => ({ useWindowControlsOverlay: () => false }))
vi.mock('@/components/auth/RouteGuard', () => ({ RouteGuard: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/components/auth/SessionExpiredGate', () => ({ SessionExpiredGate: () => null }))
vi.mock('@/features/claude-chat/public-api/runtime', () => ({
  ChatRuntimeProvider: ({ children }: { children: ReactNode }) => children,
  ChatRuntimeOverlays: () => null,
  useChatRuntime: () => ({ chat: null, floating: false, minimized: false }),
}))
vi.mock('@/assistant-sdk/AssistantBridge', () => ({ AssistantBridge: () => null }))
afterEach(cleanup)

it('shows the tool skeleton on navigation without waiting for page code or hiding navigation', async () => {
  render(<MemoryRouter><App /></MemoryRouter>)
  fireEvent.click(screen.getByRole('link', { name: '工具入口' }))
  expect(await screen.findByRole('region', { name: '待加载工具加载中' })).toBeVisible()
  expect(screen.getByRole('link', { name: '工具入口' })).toBeVisible()
  await act(async () => pending.finishTool())
  expect(await screen.findByText('工具真实内容')).toBeVisible()
  expect(screen.queryByRole('region', { name: '待加载工具加载中' })).not.toBeInTheDocument()
})

it('also covers showcase routes and preserves the return destination', async () => {
  render(<MemoryRouter initialEntries={['/showcase']}><App /></MemoryRouter>)
  expect(await screen.findByRole('region', { name: '待加载展示加载中' })).toBeVisible()
  expect(screen.getByRole('link', { name: '返回工作台' })).toHaveAttribute('href', '/')
  await act(async () => pending.finishShowcase())
  expect(await screen.findByText('展示真实内容')).toBeVisible()
})
