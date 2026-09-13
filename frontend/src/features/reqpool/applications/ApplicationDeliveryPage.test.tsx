import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { ApplicationDeliveryPage, DeliveryHome } from './ApplicationDeliveryPage'
import { listRegistry } from '@/features/project-workspace/public-api'
import { getOpenSpecBoards } from '@/features/openspec-board/public-api'
import type { RegistryProject } from '@/features/project-workspace/public-api'

vi.mock('@/shell/permission', () => ({ usePermission: () => true }))
vi.mock('@/features/project-workspace/public-api', () => ({ listRegistry: vi.fn() }))
vi.mock('@/features/openspec-board/public-api', () => ({ getOpenSpecBoards: vi.fn(), ApplicationTaskBoard: ({ projectId }: { projectId: string }) => <p>工作区任务 {projectId}</p> }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const application = { id: 'app', metadata: { name: '应用甲', localPath: '/work/app' } } as RegistryProject

it('preserves existing requirement search links', () => {
  function Destination() { const location = useLocation(); return <p>{location.pathname + location.search + location.hash}</p> }
  render(<MemoryRouter initialEntries={['/tools/reqpool?q=order#item']}><Routes><Route path="/tools/reqpool" element={<DeliveryHome />} /><Route path="/tools/reqpool/requirements" element={<Destination />} /></Routes></MemoryRouter>)
  expect(screen.getByText('/tools/reqpool/requirements?q=order#item')).toBeInTheDocument()
})

function renderPage(path: string) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><Routes><Route path="/tools/reqpool/apps/:systemId" element={<ApplicationDeliveryPage />} /><Route path="/tools/reqpool" element={<ApplicationDeliveryPage />} /></Routes></MemoryRouter></QueryClientProvider>)
}

it('shows the matching workspace inside the registered application', async () => {
  vi.mocked(listRegistry).mockResolvedValue([application])
  vi.mocked(getOpenSpecBoards).mockResolvedValue({ snapshotAt: '', projects: [{ id: 'workspace', name: '别名', sourcePath: '/work/app', state: 'READY', message: '', changes: [], totalTasks: 0, completedTasks: 0, snapshotAt: '' }] })
  renderPage('/tools/reqpool/apps/app')
  expect(await screen.findByText('工作区任务 workspace')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '应用甲' })).toBeInTheDocument()
})

it('offers recovery instead of guessing a same-name workspace', async () => {
  vi.mocked(listRegistry).mockResolvedValue([application])
  vi.mocked(getOpenSpecBoards).mockResolvedValue({ snapshotAt: '', projects: [] })
  renderPage('/tools/reqpool/apps/app')
  expect(await screen.findByText('尚未关联 OpenSpec 工作区')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '检查项目目录' })).toHaveAttribute('href', '/tools/project-workspace')
})

it('offers registration when there are no applications', async () => {
  vi.mocked(listRegistry).mockResolvedValue([])
  vi.mocked(getOpenSpecBoards).mockResolvedValue({ snapshotAt: '', projects: [] })
  renderPage('/tools/reqpool')
  expect(await screen.findByText('还没有登记的 AI 应用')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '前往项目库' })).toBeInTheDocument()
})
