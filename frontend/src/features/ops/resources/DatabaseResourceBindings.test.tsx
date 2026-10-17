import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DatabaseResourceBindings } from './DatabaseResourceBindings'
import { DatabaseResourceBindings as PublicBindings } from '../public-api'
import { SavedDatabaseEditor } from './SavedDatabaseEditor'
import { resourceCatalog, saveResourceBinding, type ResourceCatalog } from './api'
import { listDatasources, updateDatasource, testDatasource } from '../api'
import { usePermission } from '@/shell/permission'
import type { DatasourceView } from '../types'

vi.mock('@/shell/permission', () => ({ usePermission: vi.fn() }))
vi.mock('./api', () => ({ resourceCatalog: vi.fn(), saveResourceBinding: vi.fn() }))
vi.mock('../api', () => ({ listDatasources: vi.fn(), updateDatasource: vi.fn(), testDatasource: vi.fn() }))
const resource = (id: string, environment = 'TEST') => ({ providerId: 'datasource', resource: { id, name: id, environment, kind: 'ORACLE', endpoint: `${id}:1521/test`, account: 'tester', credentialConfigured: true, capabilities: ['QUERY', 'TEST'], configurationUrl: '' } })
const catalog: ResourceCatalog = {
  systems: [{ id: 'erp', name: 'ERP', sourcePath: 'D:/ERP' }, { id: 'srm', name: 'SRM', sourcePath: 'D:/SRM' }],
  resources: [resource('db1'), resource('db2'), resource('prod', 'PROD')],
  bindings: [ { id: 'one', systemId: 'erp', providerId: 'datasource', resourceId: 'db1', purpose: '订单', enabled: true },
    { id: 'two', systemId: 'erp', providerId: 'datasource', resourceId: 'db2', purpose: '库存', enabled: true } ], unavailableProviders: [],
}
beforeEach(() => {
  vi.mocked(resourceCatalog).mockResolvedValue(structuredClone(catalog))
  vi.mocked(saveResourceBinding).mockResolvedValue(undefined)
  vi.mocked(usePermission).mockReturnValue(true)
})
afterEach(() => { cleanup(); vi.resetAllMocks() })
function mount(ui: React.ReactNode) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{ui}</QueryClientProvider>) }

it('edits either of multiple same-system bindings using the existing identity', async () => {
  mount(<DatabaseResourceBindings sourcePath="D:\ERP\" />)
  expect(await screen.findByText(/已关联 2 个数据库/)).toBeInTheDocument()
  expect(screen.getByLabelText('关联到项目库系统')).toHaveValue('erp')
  fireEvent.click(screen.getAllByRole('button', { name: '编辑关联' })[1])
  fireEvent.change(screen.getByLabelText('资源用途'), { target: { value: '库存匹配' } })
  fireEvent.click(screen.getByLabelText('启用关联'))
  fireEvent.click(screen.getByRole('button', { name: '保存关联' }))
  await waitFor(() => expect(saveResourceBinding).toHaveBeenCalled())
  expect(vi.mocked(saveResourceBinding).mock.calls[0][0]).toEqual({ systemId: 'erp', providerId: 'datasource', resourceId: 'db2', purpose: '库存匹配', enabled: false })
})

it('does not infer system from its display name; prevents adding PROD and preserves failed draft', async () => {
  vi.mocked(saveResourceBinding).mockRejectedValue(new Error('offline'))
  mount(<DatabaseResourceBindings sourcePath="D:/not-registered" />)
  await screen.findByRole('option', { name: /ERP ·/ })
  expect(screen.getByLabelText('关联到项目库系统')).toHaveValue('')
  fireEvent.change(screen.getByLabelText('关联到项目库系统'), { target: { value: 'srm' } })
  expect(screen.getByRole('option', { name: /prod · PROD/ })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('可关联数据库'), { target: { value: 'db2' } })
  fireEvent.change(screen.getByLabelText('资源用途'), { target: { value: '跨系统只读库存' } })
  fireEvent.click(screen.getByRole('button', { name: '关联数据库' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('草稿已保留')
  expect(screen.getByLabelText('可关联数据库')).toHaveValue('db2')
  expect(screen.getByLabelText('资源用途')).toHaveValue('跨系统只读库存')
})

it('keeps the original ops permission and makes no requests when denied', () => {
  vi.mocked(usePermission).mockReturnValue(false)
  mount(<PublicBindings />)
  expect(screen.getByText(/需要系统资源管理权限/)).toBeInTheDocument()
  expect(resourceCatalog).not.toHaveBeenCalled()
})

it('edits the original source with a blank password and tests the saved connection', async () => {
  const source: DatasourceView = { id: 'db1', systemId: 'legacy-erp', env: 'TEST', type: 'ORACLE', category: 'SQL', queryable: true, name: 'db1', host: 'before', port: 1521,
    username: 'tester', passwordConfigured: true, dbName: 'test', params: '', note: '', sortOrder: 4, createdAt: 1, updatedAt: 1, endpoint: 'before:1521/test' }
  vi.mocked(listDatasources).mockResolvedValue([source])
  vi.mocked(updateDatasource).mockResolvedValue({ ...source, host: 'after' })
  vi.mocked(testDatasource).mockResolvedValue({ ok: true, elapsedMs: 28, message: 'Oracle 可用' })
  mount(<SavedDatabaseEditor id="db1" onClose={vi.fn()} />)
  const host = await screen.findByPlaceholderText('Host / IP')
  expect(screen.getByPlaceholderText('密码（留空保持原值）')).toHaveValue('')
  fireEvent.change(host, { target: { value: 'after' } })
  expect(screen.getByRole('button', { name: '测试连接' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await screen.findByText(/原连接已保存/)
  expect(vi.mocked(updateDatasource).mock.calls[0]).toEqual(['db1', expect.objectContaining({ systemId: 'legacy-erp', host: 'after', password: '', sortOrder: 4 })])
  fireEvent.click(screen.getByRole('button', { name: '测试连接' }))
  expect(await screen.findByText(/连接成功.*Oracle 可用/)).toBeInTheDocument()
  expect(vi.mocked(testDatasource).mock.calls[0][0]).toBe('db1')
})
