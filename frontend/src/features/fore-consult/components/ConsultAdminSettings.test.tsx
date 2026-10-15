import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ConsultAdminSettings } from './ConsultAdminSettings'
import { getConsultAttachmentPolicy, getConsultDatabaseConfiguration, saveConsultAttachmentPolicy } from '../consultAttachmentPolicy'

vi.mock('../consultAttachmentPolicy', async original => ({ ...await original<typeof import('../consultAttachmentPolicy')>(),
  getConsultAttachmentPolicy: vi.fn(), getConsultDatabaseConfiguration: vi.fn(), saveConsultAttachmentPolicy: vi.fn() }))
const policy = { uploadMaxMb: 100, readMaxMb: 50, effectiveUploadBytes: 104857600, effectiveReadBytes: 52428800, transportMaxBytes: 209715200, maxAttachments: 10 }
beforeEach(() => {
  vi.mocked(getConsultAttachmentPolicy).mockResolvedValue(policy)
  vi.mocked(getConsultDatabaseConfiguration).mockResolvedValue({ workflowVersion: 2, selectedBindingIds: ['erp-test'], resources: [
    { bindingId: 'erp-test', systemName: 'ERP', name: '测试Oracle', environment: 'TEST', endpoint: 'db-test:1521/test', state: 'AVAILABLE', configurationUrl: '/tools/reqpool/resources?view=connections&editDatasource=ds-test' },
  ] })
})
afterEach(() => { cleanup(); vi.resetAllMocks() })
function mount() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><ConsultAdminSettings /></QueryClientProvider>) }

it('shows published database selection and links to the original record; invalid limits cannot save', async () => {
  mount()
  expect(await screen.findByText('ERP · 测试Oracle')).toBeInTheDocument()
  expect(screen.getByText(/已发布流程选用 · 允许查询/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '查看 / 修改此连接 ↗' })).toHaveAttribute('href', expect.stringContaining('editDatasource=ds-test'))
  fireEvent.change(screen.getByLabelText('文本附件读取上限'), { target: { value: '101' } })
  expect(screen.getByRole('button', { name: '保存附件限制' })).toBeDisabled()
  expect(saveConsultAttachmentPolicy).not.toHaveBeenCalled()
})

it('keeps the draft after save failure and allows a successful retry', async () => {
  vi.mocked(saveConsultAttachmentPolicy).mockRejectedValueOnce(new Error('网络暂不可用')).mockResolvedValue({ ...policy, readMaxMb: 60, effectiveReadBytes: 60 * 1024 * 1024 })
  mount(); const read = await screen.findByLabelText('文本附件读取上限')
  fireEvent.change(read, { target: { value: '60' } })
  fireEvent.click(screen.getByRole('button', { name: '保存附件限制' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('原配置未更改')
  expect(read).toHaveValue(60)
  fireEvent.click(screen.getByRole('button', { name: '保存附件限制' }))
  await waitFor(() => expect(screen.getByText('附件限制已保存并生效。')).toBeInTheDocument())
  expect(saveConsultAttachmentPolicy).toHaveBeenLastCalledWith(expect.objectContaining({ uploadMaxMb: 100, readMaxMb: 60 }), expect.anything())
})
