import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { AccountMenu } from './AccountMenu'

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { username: 'admin', roles: ['ADMIN'] } }), logout: vi.fn() }))
vi.mock('./useMockMode', () => ({ useMockMode: () => ({ enabled: false }) }))
vi.mock('./featureRegistry', () => ({ pathHasMock: () => false }))
vi.mock('./SettingsDialog', () => ({ SettingsDialog: () => null }))
vi.mock('@/components/auth/LoginDialog', () => ({ LoginDialog: () => null }))
afterEach(cleanup)

function RouteState() {
  const location = useLocation()
  return <output aria-label="当前路由">{location.pathname}{location.search}{location.hash}</output>
}

it.each([
  ['/tools/claude-chat?sessionId=session-a&view=communications&recordId=record-a#note', '/tools/claude-chat?sessionId=session-a&view=communications&recordId=record-a&guide=1#note'],
  ['/tools/doc-viewer/local/project/readme.md?file=other', '/tools/claude-chat?guide=1'],
  ['/tools/claude-chat?control=llm', '/tools/claude-chat?guide=1'],
])('从用户菜单打开导览并正确继承工作区：%s', (route, target) => {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[route]}>
    <AccountMenu collapsed /><RouteState />
  </MemoryRouter></QueryClientProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'admin（ADMIN）' }))
  expect(screen.getByRole('button', { name: '偏好设置' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '功能导览' }))
  expect(screen.getByLabelText('当前路由')).toHaveTextContent(target)
  expect(screen.queryByRole('button', { name: '功能导览' })).not.toBeInTheDocument()
})
