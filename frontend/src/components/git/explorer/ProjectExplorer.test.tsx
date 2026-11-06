import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { http } from '@/lib/api'
import ProjectExplorer from './ProjectExplorer'
import { ProjectExplorerButton } from './ProjectExplorerButton'

vi.mock('@/lib/api', () => ({ http: vi.fn() }))
vi.mock('./ReviewCode', () => ({ ReviewCode: ({ before, after, mode }: { before: string; after: string; mode: string }) => <div data-testid="review-code" data-mode={mode}><pre>{before}</pre><pre>{after}</pre></div> }))
vi.mock('react-virtuoso', () => ({ Virtuoso: ({ data, itemContent, components }: { data: unknown[]; itemContent: (index: number, item: unknown) => React.ReactNode; components?: { Footer: () => React.ReactNode } }) => <div>{data.map((item, index) => <div key={index}>{itemContent(index, item)}</div>)}{components?.Footer && <components.Footer />}</div> }))
const sha = 'a'.repeat(40), second = 'b'.repeat(40)
const calls: URL[] = []
const tree = { ref: sha, entries: [{ path: 'Hello.java', name: 'Hello.java', type: 'blob' }], hasMore: false }
const deleted = { path: 'old.java', oldPath: null, status: 'D', x: '', y: '' }
beforeEach(() => {
  calls.length = 0
  vi.mocked(http).mockImplementation(async path => {
    const url = new URL(path, 'https://forge.test'); calls.push(url)
    if (url.pathname.endsWith('/info')) return { branch: 'main', head: sha }
    if (url.pathname.endsWith('/tree')) return tree
    if (url.pathname.endsWith('/history')) return { ref: sha, commits: [{ hash: sha, shortHash: 'aaaaaaa', subject: '删除旧实现', author: 'Ada', date: '2026-11-06T12:00:00Z', body: '' }], hasMore: url.searchParams.get('offset') === '0' }
    if (url.pathname.endsWith('/changes')) return { base: second, target: sha, files: [deleted] }
    if (url.pathname.endsWith('/workspace')) return { base: sha, target: 'WORKTREE', files: [{ path: 'Hello.java', oldPath: null, status: 'M', x: 'M', y: 'M' }] }
    if (url.pathname.endsWith('/source')) return { path: 'Hello.java', before: '', after: 'class Hello {}', status: '', notice: '' }
    if (url.pathname.endsWith('/difference')) return { path: 'old.java', before: 'class Old {}', after: '', status: 'D', notice: '' }
    throw new Error(`unexpected query ${path}`)
  })
})
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals() })
function show() {
  const close = vi.fn()
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })}><ProjectExplorer endpoint="/project-registry/current/review" title="Current" onClose={close} /></QueryClientProvider>)
  return close
}

it('reads the bound project without accepting a new root, and exposes resizable columns', async () => {
  show()
  const files = screen.getByRole('region', { name: '文件清单' })
  fireEvent.click(await within(files).findByRole('button', { name: 'Hello.java' }))
  expect(await screen.findByText('class Hello {}')).toBeInTheDocument()
  expect(screen.getByTestId('review-code')).toHaveAttribute('data-mode', 'source')
  expect(calls.every(url => url.pathname.startsWith('/project-registry/current/review/'))).toBe(true)
  expect(calls.every(url => !url.searchParams.has('root') && !url.searchParams.has('cwd'))).toBe(true)
  const divider = screen.getByRole('separator', { name: '调整导航栏宽度' })
  fireEvent.keyDown(divider, { key: 'ArrowRight' })
  expect(divider).toHaveAttribute('aria-valuenow', '256')
})

it('keeps historical deletes readable, supports split, and pins history pagination', async () => {
  show()
  fireEvent.click(screen.getByRole('button', { name: '提交历史' }))
  fireEvent.change(await screen.findByRole('textbox', { name: '搜索已加载提交' }), { target: { value: 'Ada' } })
  fireEvent.click(await screen.findByRole('button', { name: /删除旧实现/ }))
  fireEvent.click(await screen.findByRole('button', { name: /删除.*old.java/ }))
  expect(await screen.findByText('class Old {}')).toBeInTheDocument()
  expect(screen.getByText(/已删除文件/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '左右' }))
  expect(screen.getByTestId('review-code')).toHaveAttribute('data-mode', 'split')
  fireEvent.click(screen.getByRole('button', { name: '加载更多提交' }))
  await waitFor(() => expect(calls.some(url => url.pathname.endsWith('/history') && url.searchParams.get('offset') === '1' && url.searchParams.get('ref') === sha)).toBe(true))
})

it('keeps index and unstaged requests distinct and permits navigation after a read failure', async () => {
  show()
  fireEvent.click(screen.getByRole('button', { name: '工作区变更' }))
  fireEvent.change(screen.getByRole('combobox', { name: '工作区比较层' }), { target: { value: 'index' } })
  await waitFor(() => expect(calls.some(url => url.pathname.endsWith('/workspace') && url.searchParams.get('layer') === 'index')).toBe(true))
  fireEvent.change(screen.getByRole('combobox', { name: '工作区比较层' }), { target: { value: 'worktree' } })
  await waitFor(() => expect(calls.some(url => url.pathname.endsWith('/workspace') && url.searchParams.get('layer') === 'worktree')).toBe(true))
  vi.mocked(http).mockRejectedValueOnce(new Error('文件读取失败'))
  fireEvent.click(await within(screen.getByRole('region', { name: '文件清单' })).findByRole('button', { name: /Hello.java/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('文件读取失败')
  expect(screen.getByRole('button', { name: '重试读取' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '关闭项目浏览器' })).toBeEnabled()
})

it('opens and closes in place, restoring the project action focus', async () => {
  render(<QueryClientProvider client={new QueryClient()}><ProjectExplorerButton id="bound" title="Bound" /></QueryClientProvider>)
  const trigger = screen.getByRole('button', { name: '项目浏览器：Bound' })
  trigger.focus(); fireEvent.click(trigger)
  await screen.findByRole('dialog', { name: 'Bound · 项目浏览器' })
  fireEvent.click(screen.getByRole('button', { name: '关闭项目浏览器' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await waitFor(() => expect(trigger).toHaveFocus())
})

it('does not replace a newer file selection with an older pending response', async () => {
  let finish!: (value: unknown) => void
  const standard = vi.mocked(http).getMockImplementation()!
  vi.mocked(http).mockImplementation(async (path, init) => {
    if (path.includes('/tree?')) return { ...tree, entries: [...tree.entries, { path: 'Other.java', name: 'Other.java', type: 'blob' }] }
    if (path.includes('/source?') && path.includes('Hello.java')) return new Promise(resolve => { finish = resolve })
    if (path.includes('/source?')) return { path: 'Other.java', before: '', after: 'class Other {}', status: '', notice: '' }
    return standard(path, init)
  })
  show()
  const files = screen.getByRole('region', { name: '文件清单' })
  fireEvent.click(await within(files).findByRole('button', { name: 'Hello.java' }))
  await waitFor(() => expect(finish).toBeDefined())
  fireEvent.click(within(files).getByRole('button', { name: 'Other.java' }))
  expect(await screen.findByText('class Other {}')).toBeInTheDocument()
  await act(async () => finish({ path: 'Hello.java', before: '', after: 'old response', status: '', notice: '' }))
  expect(screen.queryByText('old response')).not.toBeInTheDocument()
})
