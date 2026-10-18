import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ApplicationAccounts } from './ApplicationAccounts'
import * as api from './api'

vi.mock('./api', async importOriginal => ({ ...(await importOriginal<typeof api>()),
  listApplicationResources: vi.fn(), createApplicationResource: vi.fn(),
  updateApplicationResource: vi.fn(), deleteApplicationResource: vi.fn(),
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.listApplicationResources).mockResolvedValue([])
})

afterEach(cleanup)

test.each(['/login', ''])('creates a server-owned web credential with optional API path %s', async loginPath => {
  vi.mocked(api.createApplicationResource).mockResolvedValue({ id: 'app-1', name: 'ERP UAT', environment: 'UAT', baseUrl: 'https://uat.example.test', authType: 'FORM_COOKIE', loginPath: loginPath || null, username: 'tester', credentialConfigured: true, usernameField: 'username', passwordField: 'password', tokenJsonPath: 'data.accessToken', tenantHeader: null, tenantValue: null })
  render(<QueryClientProvider client={new QueryClient()}><ApplicationAccounts /></QueryClientProvider>)
  await screen.findByText('尚未配置应用站点。新增后可绑定到任意项目库系统。')
  fireEvent.click(screen.getByRole('button', { name: '新增应用' }))
  fireEvent.change(screen.getByLabelText('资源名称'), { target: { value: 'ERP UAT' } })
  fireEvent.change(screen.getByLabelText('实例地址'), { target: { value: 'https://uat.example.test' } })
  fireEvent.change(screen.getByLabelText('登录方式'), { target: { value: 'FORM_COOKIE' } })
  fireEvent.change(screen.getByLabelText('登录API路径（可选，仅接口调用）'), { target: { value: loginPath } })
  fireEvent.change(screen.getByLabelText('登录账号'), { target: { value: 'tester' } })
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'server-secret' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(api.createApplicationResource).toHaveBeenCalledWith(expect.objectContaining({ name: 'ERP UAT', loginPath, password: 'server-secret' })))
  expect(screen.queryByDisplayValue('server-secret')).not.toBeInTheDocument()
})
