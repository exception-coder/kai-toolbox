import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { listSavedWorkingDirectories, removeSavedWorkingDirectory, saveWorkingDirectory } from '../api/savedWorkingDirectories'
import { browseWorkingDirectory } from '../api/workingDirectories'
import { SavedWorkingDirectories } from './SavedWorkingDirectories'

vi.mock('../api/savedWorkingDirectories', () => ({ listSavedWorkingDirectories: vi.fn(), removeSavedWorkingDirectory: vi.fn(), saveWorkingDirectory: vi.fn() }))
vi.mock('../api/workingDirectories', () => ({ browseWorkingDirectory: vi.fn() }))
const clients: QueryClient[] = []
function mount(cwd = 'D:/new') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  clients.push(client)
  const onSelect = vi.fn()
  return { onSelect, ...render(<QueryClientProvider client={client}><SavedWorkingDirectories cwd={cwd} onSelect={onSelect} /></QueryClientProvider>) }
}
beforeEach(() => {
  vi.mocked(listSavedWorkingDirectories).mockResolvedValue(['D:/existing'])
  vi.mocked(browseWorkingDirectory).mockResolvedValue({ path: 'D:/existing', parent: 'D:/', directories: [], truncated: false })
})
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.resetAllMocks() })

it('saves explicitly and loads the persisted shortcut into a new mount', async () => {
  const paths = ['D:/existing', 'D:/new']
  vi.mocked(saveWorkingDirectory).mockImplementation(async () => { vi.mocked(listSavedWorkingDirectories).mockResolvedValue(paths); return paths })
  const view = mount()
  await screen.findByRole('button', { name: 'D:/existing' })
  fireEvent.click(screen.getByRole('button', { name: '保存当前目录' }))
  await screen.findByText('已保存到常用目录，后续可直接点选。')
  expect(saveWorkingDirectory).toHaveBeenCalledWith('D:/new')
  expect(view.onSelect).not.toHaveBeenCalled()
  view.unmount()
  mount()
  expect(await screen.findByRole('button', { name: 'D:/new' })).toBeEnabled()
})

it('validates a saved directory before selecting and keeps an invalid shortcut removable', async () => {
  const { onSelect } = mount()
  fireEvent.click(await screen.findByRole('button', { name: 'D:/existing' }))
  await waitFor(() => expect(onSelect).toHaveBeenCalledWith('D:/existing'))
  vi.mocked(browseWorkingDirectory).mockRejectedValue(new Error('目录已排除'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'D:/existing' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'D:/existing' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('目录已排除')
  expect(onSelect).toHaveBeenCalledTimes(1)
  vi.mocked(removeSavedWorkingDirectory).mockResolvedValue([])
  fireEvent.click(screen.getByRole('button', { name: '移除常用目录 D:/existing' }))
  await screen.findByText('已移除快捷入口，磁盘文件保持不变。')
  expect(screen.queryByRole('button', { name: 'D:/existing' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '常用目录' })).toHaveFocus()
})

it('does not overwrite a failed load and offers retry without hiding the save result', async () => {
  vi.mocked(listSavedWorkingDirectories).mockRejectedValueOnce(new Error('读取失败')).mockResolvedValue(['D:/existing'])
  vi.mocked(saveWorkingDirectory).mockRejectedValue(new Error('保存失败'))
  mount()
  await screen.findByRole('alert')
  expect(screen.getByRole('button', { name: '保存当前目录' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '重试常用目录' }))
  await screen.findByRole('button', { name: 'D:/existing' })
  fireEvent.click(screen.getByRole('button', { name: '保存当前目录' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('保存失败')
  expect(screen.getByRole('button', { name: 'D:/existing' })).toBeEnabled()
})
