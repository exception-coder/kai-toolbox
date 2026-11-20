import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { SessionProjectDirectoriesDialog } from './SessionProjectDirectoriesDialog'

const api = vi.hoisted(() => ({
  listSessionProjectDirectories: vi.fn(),
  listWorkspaces: vi.fn(),
  replaceSessionProjectDirectories: vi.fn(),
}))
vi.mock('../api', () => api)
vi.mock('@/features/_devkit/public-api', () => ({
  normalizeWorkspaceProjectPath: (path: string) => path.replace(/\\/g, '/').toLowerCase(),
  useVisibleWorkspaceProjects: () => ({ ready: true, projects: [
    { label: 'Main', path: 'D:\\work\\main' },
    { label: 'CRM', path: 'D:\\work\\crm' },
    { label: 'ERP', path: 'D:\\work\\erp' },
    { label: 'SRM', path: 'D:\\work\\srm' },
  ] }),
}))

afterEach(cleanup)

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  api.listWorkspaces.mockResolvedValue([])
  api.listSessionProjectDirectories.mockResolvedValue(['D:/WORK/crm'])
  render(<QueryClientProvider client={client}>
    <SessionProjectDirectoriesDialog sessionId="s1" primaryCwd="D:\work\main" onChanged={vi.fn()} onClose={vi.fn()} />
  </QueryClientProvider>)
}

it('分组显示已关联与未关联项目，勾选时卡片保持原分组', async () => {
  mount()
  const linked = await screen.findByRole('region', { name: '已关联' })
  const unlinked = screen.getByRole('region', { name: '未关联' })
  expect(within(linked).getByText('已关联 · 1')).toBeInTheDocument()
  expect(within(linked).getByRole('button', { name: /CRM/ })).toHaveAttribute('aria-pressed', 'true')
  expect(within(unlinked).getByText('未关联 · 2')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Main/ })).not.toBeInTheDocument()

  fireEvent.click(within(unlinked).getByRole('button', { name: /ERP/ }))
  fireEvent.click(within(linked).getByRole('button', { name: /CRM/ }))
  expect(within(unlinked).getByRole('button', { name: /ERP/ })).toHaveAttribute('aria-pressed', 'true')
  expect(within(linked).getByRole('button', { name: /CRM/ })).toHaveAttribute('aria-pressed', 'false')
})

it('搜索同时作用于两组并给出分组内的空状态', async () => {
  mount()
  await screen.findByRole('region', { name: '已关联' })
  fireEvent.change(screen.getByPlaceholderText('搜索项目名称或目录'), { target: { value: 'srm' } })
  expect(within(screen.getByRole('region', { name: '已关联' })).getByText('没有匹配的已关联项目')).toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: '未关联' })).getByRole('button', { name: /SRM/ })).toBeInTheDocument()
})
