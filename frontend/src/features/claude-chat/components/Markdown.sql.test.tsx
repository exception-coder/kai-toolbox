import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { Markdown } from './Markdown'

const api = vi.hoisted(() => ({ sql: vi.fn(), open: vi.fn(), editor: vi.fn() }))
vi.mock('../api', () => ({ readSessionSql: api.sql, openSessionLocalPath: api.open }))
vi.mock('@uiw/react-codemirror', () => ({ default: (props: { value: string; readOnly: boolean; editable: boolean }) => {
  api.editor(props)
  return <pre data-testid="sql-content" data-readonly={props.readOnly} data-editable={props.editable}>{props.value}</pre>
} }))
const clients: QueryClient[] = []
const file = (content = '-- 中文\r\nSELECT 1;', truncated = false) => ({ name: 'draft.sql', path: 'D:/project/draft.sql', content, size: content.length, binary: false, truncated })
function setup(text = '[SQL](D:/project/draft.sql)', sessionId = 'session') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  return render(<QueryClientProvider client={client}><Markdown inlineFiles={false} text={text} sessionId={sessionId} /></QueryClientProvider>)
}
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.resetAllMocks(); vi.unstubAllGlobals() })

it.each([
  ['/D:/Users/zhang/myWork/yoooni-platform-suite/.run/internal-mysql/agent-dual-source-pending.sql', 'D:/Users/zhang/myWork/yoooni-platform-suite/.run/internal-mysql/agent-dual-source-pending.sql'],
  ['file:///D:/My%20Project/draft.SQL#L3', 'D:/My Project/draft.SQL'],
  ['docs/draft.sql:42:7', 'docs/draft.sql'],
])('opens %s lazily without a system application, closing restores focus', async (path, expected) => {
  api.sql.mockResolvedValue(file())
  setup(`[SQL](${path})`)
  const link = screen.getByRole('link', { name: 'SQL' })
  expect(api.sql).not.toHaveBeenCalled()
  fireEvent.click(link)
  expect(await screen.findByTestId('sql-content')).toHaveAttribute('data-readonly', 'true')
  expect(screen.getByTestId('sql-content')).toHaveAttribute('data-editable', 'false')
  expect(api.sql).toHaveBeenCalledWith('session', expected, expect.any(AbortSignal))
  expect(api.editor.mock.calls[0][0].extensions.length).toBeGreaterThan(0)
  expect(api.open).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: /执行/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '关闭 SQL 预览' }))
  await waitFor(() => expect(link).toHaveFocus())
})

it('copies original CRLF text and treats HTML and SQL as literal data', async () => {
  const content = '-- <script>window.bad=1</script>\r\nSELECT 1;'
  api.sql.mockResolvedValue(file(content))
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText }, platform: 'Win32' })
  setup()
  fireEvent.click(screen.getByRole('link', { name: 'SQL' }))
  await screen.findByTestId('sql-content')
  expect(screen.getByRole('dialog').querySelector('script')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '复制 SQL 原文' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(content))
  expect(await screen.findByRole('status')).toHaveTextContent('未执行')
})

it('keeps remote links external and refuses local reading without a session', () => {
  setup('[外链](https://example.org/draft.sql) [SQL](./draft.sql)', '')
  expect(screen.getByRole('link', { name: '外链' })).toHaveAttribute('href', 'https://example.org/draft.sql')
  fireEvent.click(screen.getByRole('link', { name: 'SQL' }))
  expect(screen.getByText(/没有可用的会话/)).toBeVisible()
  expect(api.sql).not.toHaveBeenCalled()
})

it('retries failed reads, distinguishes empty files and rejects partial content', async () => {
  api.sql.mockRejectedValueOnce(new Error('权限不足')).mockResolvedValueOnce(file('')).mockResolvedValueOnce(file('partial', true))
  setup()
  fireEvent.click(screen.getByRole('link', { name: 'SQL' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('权限不足')
  fireEvent.click(screen.getByRole('button', { name: '重试读取' }))
  await screen.findByText('这份 SQL 文件为空。')
  fireEvent.click(screen.getByRole('button', { name: '重新读取 SQL' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('未取得完整')
  expect(screen.queryByTestId('sql-content')).not.toBeInTheDocument()
})

it('cancels an old read when switching sessions and ignores its late response', async () => {
  let signal!: AbortSignal, finish!: (value: ReturnType<typeof file>) => void
  api.sql.mockImplementationOnce((_id, _path, input) => { signal = input; return new Promise(resolve => { finish = resolve }) })
  const view = setup()
  fireEvent.click(screen.getByRole('link', { name: 'SQL' }))
  await waitFor(() => expect(api.sql).toHaveBeenCalledOnce())
  view.rerender(<QueryClientProvider client={clients[0]}><Markdown inlineFiles={false} text="[SQL](./other.sql)" sessionId="other" /></QueryClientProvider>)
  await waitFor(() => expect(signal.aborted).toBe(true))
  await act(async () => finish(file('old session text')))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByText('old session text')).not.toBeInTheDocument()
})
