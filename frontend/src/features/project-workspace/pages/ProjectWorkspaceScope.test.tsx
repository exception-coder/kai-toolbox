import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { ProjectWorkspacePage } from './ProjectWorkspacePage'
import { fetchProjectModules, listWorkspaces } from '@/features/claude-chat/public-api'

vi.mock('@/features/claude-chat/public-api', async importOriginal => ({
  ...await importOriginal<typeof import('@/features/claude-chat/public-api')>(),
  listWorkspaces: vi.fn(async () => ({ roots: [{ root: 'D:/old', exists: true, dirs: [{ name: 'Other', path: 'D:/old/other' }] }] })),
  listSessions: vi.fn(async () => []),
  fetchProjectModules: vi.fn(async () => ({ exists: false, modules: [], knowledgeDirExists: true })),
  listProjectDependencies: vi.fn(async () => []),
}))
vi.mock('@/features/claude-chat/public-api/runtime', () => ({ CHAT_ROUTE: '/chat', useChatRuntime: () => ({ chat: null, activate: vi.fn() }) }))
vi.mock('@/features/knowledge-graph/public-api', async importOriginal => ({ ...await importOriginal<typeof import('@/features/knowledge-graph/public-api')>(), engineStatus: vi.fn(async () => ({})) }))
vi.mock('../hooks/useStatusCache', () => ({ useStatusCache: () => ({ matches: () => true, isLoading: false, refreshing: false, snapshotOf: () => ({}), refresh: vi.fn() }) }))
vi.mock('../hooks/useWorkspaceAggregation', () => ({ useWorkspaceAggregation: () => ({ cart: { items: [] }, aggregating: false }) }))
vi.mock('../hooks/useIgnoredProjects', () => ({ useIgnoredProjects: () => ({ matches: () => true, isIgnored: () => false }) }))
vi.mock('../components/KnowledgeGraphCard', () => ({ KnowledgeGraphCard: () => null }))
vi.mock('../components/GraphifyGraphModal', () => ({ GraphifyGraphModal: () => null }))
vi.mock('../components/WorkspaceProjectSidebar', () => ({ WorkspaceProjectSidebar: () => <div>重复项目列表</div> }))
vi.mock('../components/WorkspacePageHeader', () => ({ WorkspacePageHeader: () => <div>重复项目标题</div> }))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

it('uses the registered scope without discovery or remembered-path fallback', async () => {
  localStorage.setItem('kai-toolbox:project-workspace:selected-path', 'D:/old/other')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = (path: string) => <QueryClientProvider client={client}><MemoryRouter><ProjectWorkspacePage scope={{ name: 'Forge', path }} onOpenDirectorySettings={vi.fn()} /></MemoryRouter></QueryClientProvider>
  const result = render(view('D:/registered/forge'))
  await waitFor(() => expect(fetchProjectModules).toHaveBeenCalledWith('D:/registered/forge'))
  expect(listWorkspaces).not.toHaveBeenCalled()
  expect(screen.queryByText('重复项目列表')).not.toBeInTheDocument()
  expect(screen.queryByText('重复项目标题')).not.toBeInTheDocument()
  expect(await screen.findByRole('button', { name: '检查项目目录' })).toBeEnabled()
  expect(localStorage.getItem('kai-toolbox:project-workspace:selected-path')).toBe('D:/old/other')
  result.rerender(view('D:/registered/erp'))
  await waitFor(() => expect(fetchProjectModules).toHaveBeenCalledWith('D:/registered/erp'))
  expect(fetchProjectModules).not.toHaveBeenCalledWith('D:/old/other')
})
