import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { OpsPage } from './OpsPage'
import * as api from '../api'
import type { DatasourceView, TestResult } from '../types'

vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => vi.fn() }))
vi.mock('../api', async original => ({ ...await original<typeof import('../api')>(), listSystems: vi.fn(), listDatasources: vi.fn(), updateDatasource: vi.fn(), createDatasource: vi.fn(), testDatasource: vi.fn() }))
const clients: QueryClient[] = []
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.resetAllMocks() })

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

function mountConnections(edit = true, env = 'TEST') {
  const source: DatasourceView = { id: 'db-test', systemId: 'erp', env, type: 'ORACLE', category: 'SQL', queryable: true, name: 'ERP测试库', host: 'db-test.local', port: 1521, username: 'reader', passwordConfigured: true, dbName: 'test', params: null, note: null, sortOrder: 0, createdAt: 0, updatedAt: 0, endpoint: 'db-test.local:1521/test' }
  vi.mocked(api.listSystems).mockResolvedValue([{ id: 'erp', name: 'ERP', code: 'erp', owner: null, description: null, sortOrder: 0, createdAt: 0, updatedAt: 0 }])
  vi.mocked(api.listDatasources).mockResolvedValue([source, { ...source, id: 'db-other', name: 'ERP备用测试库' }])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  clients.push(client)
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/tools/reqpool/resources?view=connections${edit ? '&editDatasource=db-test' : ''}`]}><OpsPage /></MemoryRouter></QueryClientProvider>)
}

function editor() { return within(screen.getByText('编辑中间件实例').parentElement!) }

it('uses full fixed environment choices and the shared selector for type changes', async () => {
  mountConnections()
  await screen.findByDisplayValue('db-test.local')
  const environment = editor().getByRole('combobox', { name: '部署环境' })
  expect(environment.tagName).toBe('BUTTON')
  fireEvent.click(environment)
  expect(await screen.findAllByRole('option')).toHaveLength(5)
  expect(screen.getByRole('option', { name: 'LOCAL · 本地' })).toBeVisible()
  fireEvent.click(screen.getByRole('option', { name: 'UAT · 验收' }))
  expect(environment).toHaveTextContent('UAT · 验收')
  fireEvent.click(editor().getByRole('combobox', { name: '中间件类型' }))
  fireEvent.click(await screen.findByRole('option', { name: 'Redis' }))
  expect(editor().getByPlaceholderText('端口')).toHaveValue('6379')
  fireEvent.click(editor().getByRole('button', { name: '保存' }))
  await waitFor(() => expect(api.updateDatasource).toHaveBeenCalledWith('db-test', expect.objectContaining({ env: 'UAT', type: 'REDIS', port: 6379 })))
})

it('preserves a historical environment unless the user explicitly reselects it', async () => {
  mountConnections(true, 'OLD-QA')
  await screen.findByDisplayValue('db-test.local')
  expect(editor().getByRole('combobox', { name: '部署环境' })).toHaveTextContent('OLD-QA · 历史值')
  expect(editor().getByRole('status')).toHaveTextContent('未重新选择时保留原值')
  fireEvent.click(editor().getByRole('button', { name: '保存' }))
  await waitFor(() => expect(api.updateDatasource).toHaveBeenCalledWith('db-test', expect.objectContaining({ env: 'OLD-QA' })))
})

it('shows progress and success beside the editor action and tests only the saved ID', async () => {
  let finish!: (result: TestResult) => void
  vi.mocked(api.testDatasource).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  mountConnections()
  fireEvent.change(await screen.findByDisplayValue('db-test.local'), { target: { value: 'unsaved.local' } })
  fireEvent.click(editor().getByRole('button', { name: '测试连接' }))
  expect(await editor().findByRole('status')).toHaveTextContent('正在测试')
  expect(editor().getByRole('button', { name: /测试中/ })).toBeDisabled()
  await waitFor(() => expect(vi.mocked(api.testDatasource).mock.calls[0]?.[0]).toBe('db-test'))
  expect(api.updateDatasource).not.toHaveBeenCalled()
  await act(async () => finish({ ok: true, message: 'Oracle 可用', elapsedMs: 85 }))
  expect(await editor().findByRole('status')).toHaveTextContent('连接成功')
  expect(editor().getByRole('status')).toHaveTextContent('85 ms')
  expect(editor().getByText(/测试使用已保存的连接配置/)).toBeVisible()
})

it('shows both connection rejection and request errors locally and allows retry', async () => {
  vi.mocked(api.testDatasource).mockResolvedValueOnce({ ok: false, message: '连接超时', elapsedMs: 3000 })
    .mockRejectedValueOnce(new Error('网络暂不可用'))
    .mockResolvedValueOnce({ ok: true, message: '可用', elapsedMs: 20 })
  mountConnections()
  await screen.findByDisplayValue('db-test.local')
  fireEvent.click(editor().getByRole('button', { name: '测试连接' }))
  expect(await editor().findByRole('alert')).toHaveTextContent('连接超时')
  fireEvent.click(editor().getByRole('button', { name: '测试连接' }))
  await waitFor(() => expect(editor().getByRole('alert')).toHaveTextContent('网络暂不可用'))
  fireEvent.click(editor().getByRole('button', { name: '测试连接' }))
  expect(await editor().findByRole('status')).toHaveTextContent('连接成功')
  expect(editor().queryByRole('alert')).not.toBeInTheDocument()
})

it('keeps late results bound to their original datasource when the editor switches', async () => {
  let finish!: (result: TestResult) => void
  vi.mocked(api.testDatasource).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  mountConnections()
  await screen.findByDisplayValue('db-test.local')
  fireEvent.click(editor().getByRole('button', { name: '测试连接' }))
  const otherRow = screen.getByText('ERP备用测试库').closest('div.rounded-md')! as HTMLElement
  await waitFor(() => expect(vi.mocked(api.testDatasource).mock.calls[0]?.[0]).toBe('db-test'))
  fireEvent.click(within(otherRow).getByTitle('编辑'))
  await act(async () => finish({ ok: true, message: '原连接可用', elapsedMs: 80 }))
  expect(editor().queryByText(/连接成功/)).not.toBeInTheDocument()
  const originalRow = screen.getByText('ERP测试库').closest('div.rounded-md')! as HTMLElement
  expect(within(originalRow).getByRole('status')).toHaveTextContent('原连接可用')
})

it('shows row-triggered results on the same row instead of below the entire list', async () => {
  vi.mocked(api.testDatasource).mockResolvedValue({ ok: true, message: 'Oracle 可用', elapsedMs: 12 })
  mountConnections(false)
  const row = (await screen.findByText('ERP测试库')).closest('div.rounded-md')! as HTMLElement
  fireEvent.click(within(row).getByTitle('测试连接'))
  expect(await within(row).findByRole('status')).toHaveTextContent('连接成功')
  expect(within(row).getByRole('status')).toHaveTextContent('12 ms')
})
