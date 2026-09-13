import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ProjectAIWorkspace } from './ProjectAIWorkspace'
import { listSessions } from '@/features/claude-chat/public-api'
import { isWithinProject } from '../lib/projectScope'

const chat = vi.hoisted(() => ({ open: vi.fn(), switchTo: vi.fn() }))
vi.mock('@/features/claude-chat/public-api', async importOriginal => ({
  ...await importOriginal<typeof import('@/features/claude-chat/public-api')>(),
  listSessions: vi.fn(),
}))
vi.mock('@/features/claude-chat/public-api/runtime', () => ({ CHAT_ROUTE: '/chat', useChatRuntime: () => ({ chat, activate: vi.fn() }) }))
vi.mock('../pages/ProjectWorkspacePage', () => ({ ProjectWorkspacePage: ({ scope }: { scope: { path: string } }) => <div>{scope.path}</div> }))
const scope = { name: 'Forge', path: 'D:/work/forge' }
function mount() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><ProjectAIWorkspace scope={scope} /></MemoryRouter></QueryClientProvider>) }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(listSessions).mockResolvedValue([]) })
afterEach(cleanup)

it('opens at the project root even without a profile or sessions', async () => {
  mount()
  await screen.findByText('还没有项目会话，可以直接开始，无需等待初始化。')
  fireEvent.click(screen.getByRole('button', { name: '新建项目会话' }))
  await waitFor(() => expect(chat.open).toHaveBeenCalledWith(scope.path))
  expect(chat.switchTo).not.toHaveBeenCalled()
})

it('preserves the chosen session ID and excludes sibling projects', async () => {
  vi.mocked(listSessions).mockResolvedValue([
    { id: 'root', title: '根会话', cwd: 'd:\\work\\FORGE' },
    { id: 'child', title: '模块会话', cwd: 'D:/work/forge/backend' },
    { id: 'sibling', title: '其他项目', cwd: 'D:/work/forge-other' },
  ] as Awaited<ReturnType<typeof listSessions>>)
  mount()
  await screen.findByRole('button', { name: /根会话/ })
  expect(screen.queryByText('其他项目')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /模块会话/ }))
  await waitFor(() => expect(chat.switchTo).toHaveBeenCalledWith('child'))
  expect(chat.open).not.toHaveBeenCalled()
})

it('distinguishes case-sensitive Unix paths and empty paths', () => {
  expect(isWithinProject('/work/Forge/src', '/work/Forge')).toBe(true)
  expect(isWithinProject('/work/forge/src', '/work/Forge')).toBe(false)
  expect(isWithinProject('/work/Forge2', '/work/Forge')).toBe(false)
  expect(isWithinProject('', '')).toBe(false)
})

it('shows the same title or directory name as chat and preserves the selected session identity', async () => {
  vi.mocked(listSessions).mockResolvedValue([
    { id: 'named', title: '  样衣进度调整  ', cwd: 'D:/work/forge' },
    { id: 'windows', title: null, cwd: 'D:\\work\\forge\\采购模块\\' },
    { id: 'unix', title: '   ', cwd: 'D:/work/forge/移动端/' },
  ] as Awaited<ReturnType<typeof listSessions>>)
  mount()
  expect(await screen.findByText('样衣进度调整')).toBeInTheDocument()
  expect(screen.getByText('采购模块')).toBeInTheDocument()
  expect(screen.getByText('移动端')).toBeInTheDocument()
  expect(screen.queryByText('未命名会话')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /采购模块/ }))
  await waitFor(() => expect(chat.switchTo).toHaveBeenCalledWith('windows'))
})

it('keeps the root action available when session discovery fails', async () => {
  vi.mocked(listSessions).mockRejectedValue(new Error('会话加载失败'))
  mount()
  expect(await screen.findByRole('alert')).toHaveTextContent('会话加载失败')
  expect(screen.getByRole('button', { name: '新建项目会话' })).toBeEnabled()
})
