import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { usePermission } from '@/shell/permission'
import { SystemResources, LegacyOpsRedirect } from '../public-api'
import { SystemResourcesPage } from './SystemResourcesPage'
import * as api from './api'

vi.mock('@/shell/permission', () => ({ usePermission: vi.fn() }))
vi.mock('../pages/OpsPage', () => ({ OpsPage: () => <p>原连接编辑器</p> }))
vi.mock('./ApplicationAccounts', () => ({ ApplicationAccounts: () => <p>原账号配置</p> }))
vi.mock('./api', () => ({ resourceCatalog: vi.fn(), discoverResources: vi.fn(), saveResourceBinding: vi.fn(), removeResourceBinding: vi.fn(), testResource: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
beforeEach(() => {
  vi.mocked(api.resourceCatalog).mockResolvedValue({ systems: [{ id: 'project', name: '测试系统' }], resources: [{ providerId: 'datasource', resource: { id: 'db', name: '测试数据库', kind: 'MYSQL', environment: 'TEST', endpoint: 'localhost:3306', account: 'tester', credentialConfigured: true, capabilities: ['TEST', 'QUERY'], configurationUrl: '/tools/reqpool/resources?view=connections' } }], bindings: [], unavailableProviders: [] })
  vi.mocked(api.discoverResources).mockResolvedValue([])
  vi.mocked(api.saveResourceBinding).mockResolvedValue(undefined)
})

function renderPage() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><SystemResourcesPage /></MemoryRouter></QueryClientProvider>)
}

it('preserves the resource permission at the new entry', () => {
  vi.mocked(usePermission).mockReturnValue(false)
  render(<SystemResources />)
  expect(screen.getByText('需要系统资源管理权限')).toBeInTheDocument()
  expect(api.resourceCatalog).not.toHaveBeenCalled()
  expect(usePermission).toHaveBeenCalledWith('menu:ops')
})

it('redirects old links into centralized connection settings preserving context', () => {
  function Destination() { const location = useLocation(); return <p>{location.pathname + location.search + location.hash}</p> }
  render(<MemoryRouter initialEntries={['/tools/ops?id=db#history']}><Routes><Route path="/tools/ops" element={<LegacyOpsRedirect />} /><Route path="/tools/reqpool/resources" element={<Destination />} /></Routes></MemoryRouter>)
  expect(screen.getByText('/tools/reqpool/resources?id=db&view=connections#history')).toBeInTheDocument()
})

it('requires explicit system and source selection before binding and sends references only', async () => {
  renderPage()
  await screen.findByText('测试系统')
  expect(api.discoverResources).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('项目库系统'), { target: { value: 'project' } })
  await screen.findByText(/该系统尚未关联资源/)
  expect(screen.getByRole('button', { name: '关联资源' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('可关联资源'), { target: { value: 'datasource:db' } })
  fireEvent.change(screen.getByLabelText('资源用途'), { target: { value: '订单查询' } })
  fireEvent.click(screen.getByRole('button', { name: '关联资源' }))
  await waitFor(() => expect(api.saveResourceBinding).toHaveBeenCalled())
  expect(vi.mocked(api.saveResourceBinding).mock.calls[0]?.[0]).toEqual({ systemId: 'project', providerId: 'datasource', resourceId: 'db', purpose: '订单查询', enabled: true })
})

it('offers recovery when catalog loading fails', async () => {
  vi.mocked(api.resourceCatalog).mockRejectedValue(new Error('目录暂不可用'))
  renderPage()
  expect(await screen.findByRole('alert')).toHaveTextContent('目录暂不可用')
  expect(screen.getByRole('button', { name: '刷新资源' })).toBeEnabled()
})
