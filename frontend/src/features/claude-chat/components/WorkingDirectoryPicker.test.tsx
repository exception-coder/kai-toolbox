import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { browseWorkingDirectory, listDirectoryRoots, type DirectoryListing } from '../api/workingDirectories'
import { WorkingDirectoryPicker } from './WorkingDirectoryPicker'

vi.mock('../api/workingDirectories', () => ({ browseWorkingDirectory: vi.fn(), listDirectoryRoots: vi.fn() }))
const clients: QueryClient[] = []
const listing = (path: string, parent: string | null, directories: DirectoryListing['directories'] = []): DirectoryListing => ({ path, parent, directories, truncated: false })
function mount(initialPath = 'D:/work') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  clients.push(client)
  const onSelect = vi.fn(), onCancel = vi.fn()
  render(<QueryClientProvider client={client}><WorkingDirectoryPicker initialPath={initialPath} onSelect={onSelect} onCancel={onCancel} /></QueryClientProvider>)
  return { onSelect, onCancel }
}
beforeEach(() => { vi.mocked(listDirectoryRoots).mockResolvedValue(['C:/', 'D:/']) })
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.resetAllMocks() })

it('navigates drives, children and parents without selecting until confirmation', async () => {
  vi.mocked(browseWorkingDirectory).mockImplementation(async path => {
    if (path === 'C:/') return listing(path, null, [{ name: '中文目录', path: 'C:/中文目录' }])
    if (path === 'C:/中文目录') return listing(path, 'C:/')
    return listing(path, 'D:/')
  })
  const { onSelect } = mount()
  await screen.findByText('没有可进入的子目录，可以选用当前目录。')
  fireEvent.change(screen.getByLabelText('盘符 / 根目录'), { target: { value: 'C:/' } })
  fireEvent.click(await screen.findByRole('button', { name: '中文目录' }))
  await screen.findByText('C:/中文目录')
  await waitFor(() => expect(screen.getByRole('button', { name: '上一级' })).toBeEnabled())
  expect(onSelect).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '上一级' }))
  await screen.findByRole('button', { name: '中文目录' })
  await waitFor(() => expect(screen.getByRole('button', { name: '使用此目录' })).toBeEnabled())
  expect(screen.getByRole('button', { name: '上一级' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '使用此目录' }))
  expect(onSelect).toHaveBeenCalledWith('C:/')
})

it('retains recovery controls on a failed directory and can retry or cancel', async () => {
  vi.mocked(browseWorkingDirectory).mockRejectedValueOnce(new Error('目录不可访问')).mockResolvedValue(listing('D:/work', 'D:/'))
  const { onCancel, onSelect } = mount()
  await screen.findByText('目录不可访问')
  expect(screen.getByRole('button', { name: '使用此目录' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '重试目录' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '使用此目录' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '收起' }))
  expect(onCancel).toHaveBeenCalledOnce()
  expect(onSelect).not.toHaveBeenCalled()
})

it('does not select stale data while navigation is pending', async () => {
  let resolve!: (value: DirectoryListing) => void
  vi.mocked(browseWorkingDirectory).mockResolvedValueOnce(listing('D:/work', 'D:/'))
    .mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const { onSelect } = mount()
  await waitFor(() => expect(screen.getByRole('button', { name: '使用此目录' })).toBeEnabled())
  fireEvent.change(screen.getByLabelText('盘符 / 根目录'), { target: { value: 'C:/' } })
  await screen.findByText('正在读取目录…')
  expect(screen.getByRole('button', { name: '使用此目录' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '使用此目录' }))
  expect(onSelect).not.toHaveBeenCalled()
  resolve(listing('C:/', null))
  await waitFor(() => expect(screen.getByRole('button', { name: '使用此目录' })).toBeEnabled())
})
