import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import { listRoles } from '../api'
import { RolePage } from './RolePage'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return { ...actual, listRoles: vi.fn(), createRole: vi.fn(), updateRole: vi.fn(), deleteRole: vi.fn() }
})
vi.mock('@/shell/permission', () => ({ usePermission: () => true }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RolePage', () => {
  it('renders scannable role details and protected built-in actions', async () => {
    vi.mocked(listRoles).mockResolvedValue([
      { id: 1, name: '系统管理员', code: 'ADMIN', description: '维护平台配置', builtin: true, dataScopeType: 'ALL', status: 'ENABLED', createdAt: 1 },
      { id: 2, name: '项目成员', code: 'PROJECT_MEMBER', description: null, builtin: false, dataScopeType: 'SELF', status: 'DISABLED', createdAt: 2 },
    ])
    renderPage()

    expect(await screen.findByText('系统管理员')).toBeInTheDocument()
    expect(screen.getByText('全部数据')).toBeInTheDocument()
    expect(screen.getByText('已停用')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除角色 系统管理员' })).toBeDisabled()
    expect(screen.getByText('暂无角色说明')).toBeInTheDocument()
  })

  it('keeps save disabled until required create fields are filled', async () => {
    vi.mocked(listRoles).mockResolvedValue([])
    renderPage()
    await screen.findByText('还没有可用角色')

    fireEvent.click(screen.getByRole('button', { name: '创建第一个角色' }))
    const save = screen.getByRole('button', { name: '保存角色' })
    expect(save).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('例如：项目管理员'), { target: { value: '审阅者' } })
    fireEvent.change(screen.getByPlaceholderText('例如：PROJECT_ADMIN'), { target: { value: 'REVIEWER' } })
    expect(save).toBeEnabled()
  })

  it('offers retry when the role list cannot be loaded', async () => {
    vi.mocked(listRoles).mockRejectedValue(new Error('offline'))
    renderPage()

    expect(await screen.findByText('角色暂时无法加载')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新加载' })).toBeInTheDocument()
  })
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ConfirmProvider><RolePage /></ConfirmProvider>
    </QueryClientProvider>,
  )
}
