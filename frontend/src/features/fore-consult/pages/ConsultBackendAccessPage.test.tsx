import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ConsultBackendAccessPage } from './ConsultBackendAccessPage'
import { createBackendGrant, getBackendManagement, revokeBackendGrant, rotateBackendGrant, type BackendManagement } from '../consultBackendAdmin'

const identity = vi.hoisted(() => ({ user: { userId: 7, roles: ['ADMIN'] } }))
vi.mock('@/lib/auth', () => ({ useAuth: () => identity }))
vi.mock('../consultBackendAdmin', async original => ({ ...await original<typeof import('../consultBackendAdmin')>(),
  getBackendManagement: vi.fn(), createBackendGrant: vi.fn(), revokeBackendGrant: vi.fn(), rotateBackendGrant: vi.fn(),
}))
const metadata: BackendManagement = { enabled: true, truncated: false, projects: [{ id: 'erp', name: 'ERP' }], clients: [{
  clientId: 'fca_local', appId: 'existing-app', tenantId: 'tenant-a', projectIds: ['erp'], version: 1, status: 'ACTIVE',
  expiresAt: Date.now() + 86400000, changedBy: '7', changedAt: 1793500000000,
}] }
const issued = { clientId: 'fca_new', clientSecret: 'private-one-time-secret', appId: 'yoooni-agent', tenantId: 'tenant-test', expiresAt: Date.now() + 86400000, version: 1 }
let client: QueryClient
beforeEach(() => {
  identity.user = { userId: 7, roles: ['ADMIN'] }
  sessionStorage.clear()
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  vi.mocked(getBackendManagement).mockResolvedValue(metadata)
  vi.mocked(createBackendGrant).mockResolvedValue(issued)
  vi.mocked(rotateBackendGrant).mockResolvedValue({ ...issued, clientId: 'fca_local', version: 2 })
  vi.mocked(revokeBackendGrant).mockResolvedValue({ revoked: true })
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true })
})
afterEach(() => { cleanup(); client.clear(); vi.resetAllMocks() })
const tree = () => <MemoryRouter><QueryClientProvider client={client}><ConsultBackendAccessPage /></QueryClientProvider></MemoryRouter>
function mount() { return render(tree()) }
async function createForm() {
  await screen.findByText('existing-app')
  fireEvent.click(screen.getByRole('button', { name: '颁发凭据' }))
  fireEvent.change(screen.getByLabelText('应用标识'), { target: { value: 'yoooni-agent' } })
  fireEvent.change(screen.getByLabelText('企业标识'), { target: { value: 'tenant-test' } })
  return screen.getByRole('dialog')
}

it('does not query management data for ordinary users', () => {
  identity.user.roles = ['USER']; mount()
  expect(screen.getByText(/请使用本实例的管理员身份/)).toBeInTheDocument()
  expect(getBackendManagement).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: '颁发凭据' })).not.toBeInTheDocument()
})

it('issues once, copies private configuration and clears the only secret without caching it', async () => {
  mount(); const dialog = await createForm()
  fireEvent.click(within(dialog).getByRole('checkbox', { name: /ERP/ }))
  fireEvent.click(screen.getByRole('button', { name: '确认颁发' }))
  const result = await screen.findByLabelText('本次私有配置')
  expect((result as HTMLTextAreaElement).value).toContain('FORGE_CLIENT_SECRET=private-one-time-secret')
  expect(createBackendGrant).toHaveBeenCalledWith(expect.objectContaining({ projectIds: ['erp'], appId: 'yoooni-agent', tenantId: 'tenant-test' }), expect.any(String))
  expect(client.getMutationCache().getAll()).toHaveLength(0)
  expect(JSON.stringify(client.getQueryCache().getAll().map(q => q.state.data))).not.toContain(issued.clientSecret)
  expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(issued.clientSecret)
  fireEvent.click(screen.getByRole('button', { name: '关闭凭据操作' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('请先安全保存')
  fireEvent.click(screen.getByRole('button', { name: '复制配置' }))
  await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('FORGE_TENANT_ID=tenant-test')))
  fireEvent.click(screen.getByRole('checkbox', { name: '我已将密钥安全保存到服务端' }))
  fireEvent.click(screen.getByRole('button', { name: '已保存，清除并关闭' }))
  await waitFor(() => expect(screen.queryByLabelText('本次私有配置')).not.toBeInTheDocument())
  await waitFor(() => expect(screen.getByRole('button', { name: '颁发凭据' })).toHaveFocus())
})

it('blocks duplicate clicks and preserves input after an uncertain response without automatic retries', async () => {
  let reject!: (reason: Error) => void
  vi.mocked(createBackendGrant).mockReturnValue(new Promise((_, fail) => { reject = fail }))
  mount(); await createForm()
  const submit = screen.getByRole('button', { name: '确认颁发' })
  fireEvent.click(submit); fireEvent.click(submit)
  expect(createBackendGrant).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: '关闭凭据操作' })).toBeDisabled()
  reject(new Error('network timeout'))
  expect(await screen.findByRole('alert')).toHaveTextContent('操作结果暂未确认')
  expect(screen.getByLabelText('应用标识')).toHaveValue('yoooni-agent')
  expect(createBackendGrant).toHaveBeenCalledTimes(1)
})

it('restores the nonsecret issuance draft and reuses its UUID after the page is reopened', async () => {
  vi.mocked(createBackendGrant).mockRejectedValueOnce(new Error('unknown result')).mockResolvedValueOnce(issued)
  const first = mount(); await createForm()
  fireEvent.click(screen.getByRole('button', { name: '确认颁发' }))
  await screen.findByRole('alert')
  const intent = vi.mocked(createBackendGrant).mock.calls[0][1]
  first.unmount()
  mount(); await screen.findByText('existing-app')
  await waitFor(() => expect(screen.getByRole('button', { name: '颁发凭据' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '颁发凭据' }))
  expect(screen.getByLabelText('应用标识')).toHaveValue('yoooni-agent')
  expect(screen.getByText(/已恢复上次颁发草稿/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '确认颁发' }))
  await screen.findByLabelText('本次私有配置')
  expect(vi.mocked(createBackendGrant).mock.calls[1][1]).toBe(intent)
  expect(sessionStorage.getItem('forge.consult.grant-intent.7')).not.toContain(issued.clientSecret)
})

it('requires an explicit rotation or revocation confirmation and keeps their target identity', async () => {
  mount(); await screen.findByText('existing-app')
  fireEvent.click(screen.getByRole('button', { name: '轮换 / 续期' }))
  expect(rotateBackendGrant).not.toHaveBeenCalled()
  expect(screen.getByLabelText('企业标识')).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '确认轮换' }))
  await screen.findByLabelText('本次私有配置')
  expect(rotateBackendGrant).toHaveBeenCalledWith('fca_local', expect.any(Number))
  fireEvent.click(screen.getByRole('checkbox', { name: '我已将密钥安全保存到服务端' }))
  fireEvent.click(screen.getByRole('button', { name: '已保存，清除并关闭' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: '撤销授权' }))
  expect(revokeBackendGrant).not.toHaveBeenCalled()
  expect(screen.getByText(/新凭据不能读取旧 clientId 的任务/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '确认撤销' }))
  await waitFor(() => expect(revokeBackendGrant).toHaveBeenCalledWith('fca_local'))
})

it('shows disabled-instance setup without preventing grant preparation and recovers from copy failure', async () => {
  vi.mocked(getBackendManagement).mockResolvedValue({ ...metadata, enabled: false })
  vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('clipboard denied'))
  mount(); await createForm()
  fireEvent.click(screen.getByRole('button', { name: '确认颁发' }))
  await screen.findByLabelText('本次私有配置')
  fireEvent.click(screen.getByRole('button', { name: '复制配置' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('复制失败')
  expect((screen.getByLabelText('本次私有配置') as HTMLTextAreaElement).value).toContain(issued.clientSecret)
})

it('offers recovery after management load failure and rejects insecure delivery addresses', async () => {
  vi.mocked(getBackendManagement).mockRejectedValueOnce(new Error('not loaded')).mockResolvedValue(metadata)
  mount(); expect(await screen.findByRole('alert')).toHaveTextContent('授权读取失败')
  fireEvent.click(screen.getByRole('button', { name: '重新读取' }))
  await createForm()
  fireEvent.change(screen.getByLabelText('Forge 地址'), { target: { value: 'http://some-other-server.test' } })
  expect(screen.getByRole('button', { name: '确认颁发' })).toBeDisabled()
})

it('discards one-time state when the current user loses administrator privileges', async () => {
  const view = mount(); await createForm()
  fireEvent.click(screen.getByRole('button', { name: '确认颁发' }))
  await screen.findByLabelText('本次私有配置')
  identity.user.roles = ['USER']; view.rerender(tree())
  expect(screen.queryByLabelText('本次私有配置')).not.toBeInTheDocument()
  expect(screen.getByText(/请使用本实例的管理员身份/)).toBeInTheDocument()
})
