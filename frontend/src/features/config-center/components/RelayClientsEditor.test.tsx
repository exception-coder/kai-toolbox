import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RelayClientsEditor, RELAY_BLOCK } from './RelayClientsEditor'
import { getConfigBlock, updateConfigBlock } from '../api'

vi.mock('../api', () => ({ getConfigBlock: vi.fn(), updateConfigBlock: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

function renderEditor() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><RelayClientsEditor /></QueryClientProvider>)
}

describe('Relay client configuration', () => {
  it('saves independent rows through the existing block API and preserves input on failure', async () => {
    vi.mocked(getConfigBlock).mockResolvedValue({ id: RELAY_BLOCK, name: 'Relay', entries: [] })
    vi.mocked(updateConfigBlock).mockRejectedValue(new Error('存储暂时不可用'))
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: '添加客户端' }))
    fireEvent.change(screen.getByLabelText('Client ID 1'), { target: { value: 'yoooni-one' } })
    fireEvent.change(screen.getByLabelText('名称 1'), { target: { value: 'Yoooni One' } })
    fireEvent.change(screen.getByLabelText('Secret 1'), { target: { value: 'test-secret' } })
    fireEvent.click(screen.getByLabelText('开放 Relay 接入'))
    fireEvent.click(screen.getByRole('button', { name: '保存并生效' }))
    await screen.findByRole('alert')
    expect((screen.getByLabelText('Client ID 1') as HTMLInputElement).value).toBe('yoooni-one')
    expect(updateConfigBlock).toHaveBeenCalledWith(RELAY_BLOCK, expect.objectContaining({
      [`${RELAY_BLOCK}.enabled`]: 'true', [`${RELAY_BLOCK}.managed`]: 'true',
      [`${RELAY_BLOCK}.clients[0].client-id`]: 'yoooni-one',
      [`${RELAY_BLOCK}.clients[0].client-secret`]: 'test-secret',
    }), [`${RELAY_BLOCK}.clients`])
  })

  it('keeps managed mode when deleting the last client', async () => {
    const values = { managed: 'true', enabled: 'true', 'clients[0].client-id': 'erp',
      'clients[0].name': 'ERP', 'clients[0].client-secret': 'secret', 'clients[0].enabled': 'true' }
    const block = { id: RELAY_BLOCK, name: 'Relay', entries: Object.entries(values).map(([key, value]) => ({
      key: `${RELAY_BLOCK}.${key}`, value, overridden: true,
    })) }
    vi.mocked(getConfigBlock).mockResolvedValue(block)
    vi.mocked(updateConfigBlock).mockResolvedValue({ ...block, entries: block.entries.filter(entry => !entry.key.includes('clients[')) })
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: '删除客户端 1' }))
    fireEvent.click(screen.getByRole('button', { name: '保存并生效' }))
    await waitFor(() => expect(updateConfigBlock).toHaveBeenCalledWith(RELAY_BLOCK, {
      [`${RELAY_BLOCK}.enabled`]: 'true', [`${RELAY_BLOCK}.managed`]: 'true', [`${RELAY_BLOCK}.clients`]: '',
    }, [`${RELAY_BLOCK}.clients`]))
    await screen.findByText('已保存并生效。')
  })
})
