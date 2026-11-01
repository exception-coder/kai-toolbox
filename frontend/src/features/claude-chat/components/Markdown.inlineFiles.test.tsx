import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { Markdown } from './Markdown'

const api = vi.hoisted(() => ({ markdown: vi.fn(), sql: vi.fn(), diagram: vi.fn(), open: vi.fn() }))
vi.mock('../api', () => ({ readSessionMarkdown: api.markdown, readSessionSql: api.sql, readSessionDiagram: api.diagram, openSessionLocalPath: api.open }))
vi.mock('@uiw/react-codemirror', () => ({ default: ({ value }: { value: string }) => <pre data-testid="sql-content">{value}</pre> }))
vi.mock('@/features/doc-viewer/public-api/drawio', () => ({ isDrawioFile: (path: string) => /\.drawio(?:\.xml)?$/i.test(path), DrawioPreview: ({ content }: { content: string }) => <div data-testid="diagram-content">{content}</div> }))
const clients: QueryClient[] = []
const file = (content: string, path = 'D:/project/docs/guide.md') => ({ name: path.split('/').pop()!, path, content, size: content.length, binary: false, truncated: false })
function setup(text: string, sessionId = 'session') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  return { ...render(<QueryClientProvider client={client}><Markdown text={text} sessionId={sessionId} /></QueryClientProvider>),
    update: (next: string, id = sessionId) => <QueryClientProvider client={client}><Markdown text={next} sessionId={id} /></QueryClientProvider> }
}
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.resetAllMocks(); vi.unstubAllGlobals() })

it('automatically renders all three file types, deduplicates references and leaves examples/web links alone', async () => {
  vi.stubGlobal('IntersectionObserver', undefined)
  api.markdown.mockResolvedValue(file('# 正文标题\n\n[关联文件](other.md)'))
  api.sql.mockResolvedValue(file('SELECT 1;', 'D:/project/draft.sql'))
  api.diagram.mockResolvedValue(file('<mxGraphModel/>', 'D:/project/map.drawio'))
  const view = setup('[说明][doc]\n\n[SQL](D:/project/draft.sql) [图](D:/project/map.drawio)\n\n[重复](D:/project/docs/guide.md)\n\n[网页](https://example.org/web.sql)\n\n<a href="https://example.org/" data-sql-path="secret.sql">伪造属性</a>\n\n```text\n[代码示例](never.sql)\n```\n\n[doc]: D:/project/docs/guide.md')
  expect(await screen.findByRole('heading', { name: '正文标题' })).toBeVisible()
  expect(await screen.findByTestId('sql-content')).toHaveTextContent('SELECT 1;')
  expect(await screen.findByTestId('diagram-content')).toHaveTextContent('<mxGraphModel/>')
  expect(view.container.querySelectorAll('[data-inline-file]')).toHaveLength(3)
  expect(api.markdown).toHaveBeenCalledExactlyOnceWith('session', 'D:/project/docs/guide.md', expect.any(AbortSignal))
  expect(api.sql).toHaveBeenCalledExactlyOnceWith('session', 'D:/project/draft.sql', expect.any(AbortSignal))
  expect(api.diagram).toHaveBeenCalledExactlyOnceWith('session', 'D:/project/map.drawio', expect.any(AbortSignal))
  expect(screen.getByRole('link', { name: '关联文件' })).toHaveAttribute('data-markdown-path', 'D:/project/docs/other.md')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(api.open).not.toHaveBeenCalled()
})

it('waits for proximity, retains the renderer during streaming and shares the expanded-reader result', async () => {
  let enter!: IntersectionObserverCallback
  const disconnect = vi.fn()
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { enter = callback }
    observe() {}
    disconnect = disconnect
  })
  api.sql.mockResolvedValue(file('SELECT 2;', 'D:/project/draft.sql'))
  const text = '[SQL](D:/project/draft.sql)'
  const view = setup(text)
  await screen.findByRole('region', { name: 'SQL 文件预览：SQL' })
  expect(api.sql).not.toHaveBeenCalled()
  act(() => enter([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver))
  const renderer = await screen.findByTestId('sql-content')
  view.rerender(view.update(text + '\n\n继续输出的文字。'))
  expect(screen.getByTestId('sql-content')).toBe(renderer)
  const expand = screen.getByRole('button', { name: '展开文件 SQL' })
  fireEvent.click(expand)
  const dialog = await screen.findByRole('dialog')
  expect(await within(dialog).findByTestId('sql-content')).toHaveTextContent('SELECT 2;')
  expect(api.sql).toHaveBeenCalledTimes(1)
  fireEvent.click(within(dialog).getByRole('button', { name: '关闭 SQL 预览' }))
  await waitFor(() => expect(expand).toHaveFocus())
  expect(screen.getByTestId('sql-content')).toBe(renderer)
})

it('keeps a failed preview recoverable and rejects partial results without rendering them', async () => {
  vi.stubGlobal('IntersectionObserver', undefined)
  api.sql.mockRejectedValueOnce(new Error('文件不可读')).mockResolvedValueOnce({ ...file('partial'), truncated: true }).mockResolvedValueOnce(file('SELECT 3;'))
  setup('[SQL](./draft.sql)')
  expect(await screen.findByRole('alert')).toHaveTextContent('文件不可读')
  fireEvent.click(screen.getByRole('button', { name: '重试读取' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('未取得完整'))
  expect(screen.queryByTestId('sql-content')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重试读取' }))
  expect(await screen.findByTestId('sql-content')).toHaveTextContent('SELECT 3;')
})

it('cancels inline reads on session change and ignores the late old-session result', async () => {
  vi.stubGlobal('IntersectionObserver', undefined)
  let signal!: AbortSignal, finish!: (value: ReturnType<typeof file>) => void
  api.sql.mockImplementationOnce((_id, _path, input) => { signal = input; return new Promise(resolve => { finish = resolve }) })
  const view = setup('[SQL](./draft.sql)', 'old')
  await waitFor(() => expect(api.sql).toHaveBeenCalledTimes(1))
  view.rerender(view.update('新会话', 'new'))
  await waitFor(() => expect(signal.aborted).toBe(true))
  await act(async () => finish(file('old session text')))
  expect(screen.queryByText('old session text')).not.toBeInTheDocument()
  expect(screen.queryByTestId('sql-content')).not.toBeInTheDocument()
})
