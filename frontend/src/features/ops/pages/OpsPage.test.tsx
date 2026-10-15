import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { OpsPage } from './OpsPage'
import * as api from '../api'

vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => vi.fn() }))
vi.mock('../api', async original => ({ ...await original<typeof import('../api')>(), listSystems: vi.fn(), listDatasources: vi.fn(), updateDatasource: vi.fn(), createDatasource: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

it('opens the linked existing connection with a blank password and updates its original ID', async () => {
  vi.mocked(api.listSystems).mockResolvedValue([{ id: 'erp', name: 'ERP', code: 'erp', owner: null, description: null, sortOrder: 0, createdAt: 0, updatedAt: 0 }])
  const source = { id: 'db-test', systemId: 'erp', env: 'TEST', type: 'ORACLE' as const, category: 'SQL' as const, queryable: true, name: 'ERP测试库', host: 'db-test.local', port: 1521, username: 'reader', passwordConfigured: true, dbName: 'test', params: null, note: null, sortOrder: 0, createdAt: 0, updatedAt: 0, endpoint: 'db-test.local:1521/test' }
  vi.mocked(api.listDatasources).mockResolvedValue([source])
  vi.mocked(api.updateDatasource).mockResolvedValue(source)
  const view = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/tools/reqpool/resources?view=connections&editDatasource=db-test']}><OpsPage /></MemoryRouter></QueryClientProvider>)
  expect(await screen.findByDisplayValue('db-test.local')).toBeInTheDocument()
  expect(view.container.querySelector('input[type="password"]')).toHaveValue('')
  expect(api.createDatasource).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /^保存$/ }))
  await waitFor(() => expect(api.updateDatasource).toHaveBeenCalledWith('db-test', expect.objectContaining({ host: 'db-test.local', password: '' })))
  expect(api.createDatasource).not.toHaveBeenCalled()
})
