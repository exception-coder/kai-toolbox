import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ForeConsultPage } from './ForeConsultPage'
import { listSystemPrefs, saveSystemPrefs, type SystemPrefView, type WorkspaceList } from '../api'

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { roles: ['ADMIN'] } }) }))
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => vi.fn() }))
vi.mock('@/components/ui/prompt-dialog', () => ({ usePrompt: () => vi.fn() }))
vi.mock('@/features/claude-chat/public-api', () => ({
  useClaudeChatSocket: () => ({ items: [], sessionId: null }),
  listSessions: async () => [], fetchCodexModels: async () => [],
  CodexSessionOptions: () => null,
}))
vi.mock('../api', async original => ({ ...await original<typeof import('../api')>(),
  listWorkspaces: vi.fn(async () => workspaces),
  listSystemPrefs: vi.fn(async () => []), saveSystemPrefs: vi.fn(async () => []),
  getTopology: async () => ({ links: [] }), listConsults: async () => [],
  listCodexHomes: async () => [], getBusinessConsultModelPolicy: async () => ({}),
}))

const workspaces: WorkspaceList = { roots: [{ root: 'D:/workspace', exists: true, dirs: [
  { name: 'erp', path: 'D:/workspace/erp' },
  { name: 'hidden', path: 'D:/workspace/hidden' },
  { name: 'new-project', path: 'D:/workspace/new-project' },
] }] }
const preferences: SystemPrefView[] = [
  { systemName: 'erp', systemSourcePath: 'D:/workspace/erp', alias: 'ERP', visible: true, sortOrder: 2 },
  { systemName: 'hidden', systemSourcePath: null, alias: null, visible: false, sortOrder: 1 },
]
let client: QueryClient
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.mocked(listSystemPrefs).mockResolvedValue(preferences)
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } })
  client.setQueryData(['workspaces'], workspaces)
})
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); vi.clearAllMocks(); localStorage.removeItem('toolbox.fore-consult.skin') })
function mount() { render(<QueryClientProvider client={client}><ForeConsultPage /></QueryClientProvider>) }

it('switches the current page skin without changing the project selection policy or saving configuration', async () => {
  mount()
  const project = await screen.findByRole('button', { name: 'ERP' })
  fireEvent.click(screen.getByRole('button', { name: 'Forge 风格' }))
  expect(project.closest('.fc-space')).toHaveAttribute('data-consult-skin', 'forge')
  expect(screen.getByRole('button', { name: 'ERP' })).toBe(project)
  expect(screen.queryByRole('button', { name: 'new-project' })).not.toBeInTheDocument()
  expect(saveSystemPrefs).not.toHaveBeenCalled()
})

it('only renders marked systems after discovery and leaves new roots unselected when saving configuration', async () => {
  mount()
  await screen.findByRole('button', { name: 'ERP' })
  expect(screen.queryByRole('button', { name: 'new-project' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'hidden' })).not.toBeInTheDocument()
  await act(async () => { client.setQueryData<WorkspaceList>(['workspaces'], {
    roots: [...workspaces.roots, { root: 'D:/new-root', exists: true, dirs: [{ name: 'new-root-project', path: 'D:/new-root/new-root-project' }] }],
  }) })
  expect(screen.queryByRole('button', { name: 'new-root-project' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '配置' }))
  const newRow = screen.getByPlaceholderText('new-root-project').closest('li')!
  expect(within(newRow).getByRole('button', { name: '显示' })).toBeInTheDocument()
  expect(within(screen.getByPlaceholderText('erp').closest('li')!).getByRole('button', { name: '隐藏' })).toBeInTheDocument()
  fireEvent.click(within(newRow).getByRole('button', { name: '显示' }))
  vi.mocked(listSystemPrefs).mockResolvedValue([...preferences, {
    systemName: 'new-root-project', systemSourcePath: 'D:/new-root/new-root-project', alias: null, visible: true, sortOrder: 3,
  }])
  fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
  await waitFor(() => expect(saveSystemPrefs).toHaveBeenCalledOnce())
  const saved = vi.mocked(saveSystemPrefs).mock.calls[0][0]
  expect(saved.find(item => item.systemName === 'erp')).toMatchObject({ alias: 'ERP', visible: true })
  expect(saved.find(item => item.systemName === 'hidden')).toMatchObject({ visible: false })
  expect(saved.find(item => item.systemName === 'new-project')).toMatchObject({ visible: false })
  expect(saved.find(item => item.systemName === 'new-root-project')).toMatchObject({ visible: true })
  expect(await screen.findByRole('button', { name: 'new-root-project' })).toBeVisible()
})

it('does not flash discovered projects before preferences load and offers configuration when none are selected', async () => {
  let resolve!: (value: SystemPrefView[]) => void
  vi.mocked(listSystemPrefs).mockReturnValueOnce(new Promise(done => { resolve = done }))
  mount()
  expect(screen.queryByRole('button', { name: 'erp' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '配置' })).toBeDisabled()
  await act(async () => resolve([]))
  expect(await screen.findByText('尚未选择显示的业务系统')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '打开配置调整显示范围' }))
  expect(screen.getAllByRole('button', { name: '显示' })).toHaveLength(3)
  expect(saveSystemPrefs).not.toHaveBeenCalled()
})

it('keeps discovered projects hidden on preference failure and retries without saving', async () => {
  vi.mocked(listSystemPrefs).mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(preferences)
  mount()
  expect(await screen.findByText('系统显示配置加载失败')).toBeVisible()
  expect(screen.getByRole('button', { name: '配置' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'new-project' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重新加载显示配置' }))
  expect(await screen.findByRole('button', { name: 'ERP' })).toBeVisible()
  expect(saveSystemPrefs).not.toHaveBeenCalled()
})
