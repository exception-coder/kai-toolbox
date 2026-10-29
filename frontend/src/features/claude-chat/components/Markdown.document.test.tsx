import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Markdown } from './Markdown'

const api = vi.hoisted(() => ({ markdown: vi.fn(), image: vi.fn(), diagram: vi.fn(), open: vi.fn() }))
vi.mock('../api', () => ({ readSessionMarkdown: api.markdown, readSessionImage: api.image, readSessionDiagram: api.diagram, openSessionLocalPath: api.open }))

const file = (content = '# 接入说明\n\n这是**只读正文**。', path = 'D:/project/docs/guide.md') => ({ name: path.split('/').pop(), path, content, size: content.length, binary: false, truncated: false })
const clients: QueryClient[] = []
function setup(text = '[接入设计](D:/project/docs/guide.md)', sessionId: string | undefined = 'session') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  return render(<QueryClientProvider client={client}><Markdown text={text} sessionId={sessionId} /></QueryClientProvider>)
}
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.clearAllMocks() })

describe('消息 Markdown 文件预览', () => {
  it.each([
    ['D:/project/docs/guide.md', 'D:/project/docs/guide.md'],
    ['/D:/project/接入.md:42:7', 'D:/project/接入.md'],
    ['file:///D:/My%20Project/guide.md', 'D:/My Project/guide.md'],
    ['/home/user/guide.markdown', '/home/user/guide.markdown'],
    ['docs/guide.md#介绍', 'docs/guide.md'],
  ])('%s 点击后原位打开、关闭返回消息焦点', async (href, expected) => {
    api.markdown.mockResolvedValue(file())
    setup(`[接入设计](${href})`)
    const link = screen.getByRole('link', { name: '接入设计' })
    expect(api.markdown).not.toHaveBeenCalled()
    fireEvent.click(link)
    expect(await screen.findByRole('heading', { name: '接入说明' })).toBeVisible()
    expect(api.markdown).toHaveBeenCalledWith('session', expected, expect.any(AbortSignal))
    expect(api.open).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '关闭 Markdown 预览' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(link).toHaveFocus()
  })

  it('源码/正文和全屏切换不重新读取，Escape 先缩小再关闭', async () => {
    api.markdown.mockResolvedValue(file())
    setup()
    fireEvent.click(screen.getByRole('link', { name: '接入设计' }))
    await screen.findByRole('heading', { name: '接入说明' })
    fireEvent.click(screen.getByRole('button', { name: '源码' }))
    expect(screen.getByText(/# 接入说明/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '全屏查看 Markdown' }))
    expect(screen.getByRole('dialog')).toHaveClass('inset-0')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.getByRole('button', { name: '全屏查看 Markdown' })).toHaveFocus())
    expect(screen.getByText(/# 接入说明/)).toBeVisible()
    expect(api.markdown).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('失败可手动重试，关闭取消读取；不打开系统程序', async () => {
    api.markdown.mockRejectedValueOnce(new Error('无权读取文档'))
    let signal: AbortSignal | undefined
    api.markdown.mockImplementationOnce((_id, _path, input) => { signal = input; return new Promise(() => {}) })
    setup()
    fireEvent.click(screen.getByRole('link', { name: '接入设计' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('无权读取文档')
    fireEvent.click(screen.getByRole('button', { name: '重试读取' }))
    await waitFor(() => expect(api.markdown).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: '关闭 Markdown 预览' }))
    await waitFor(() => expect(signal?.aborted).toBe(true))
    expect(api.open).not.toHaveBeenCalled()
  })

  it('切换会话中止旧读取并忽略迟到内容', async () => {
    let signal: AbortSignal | undefined
    let finish!: (result: ReturnType<typeof file>) => void
    api.markdown.mockImplementationOnce((_id, _path, input) => { signal = input; return new Promise(resolve => { finish = resolve }) })
    const view = setup()
    fireEvent.click(screen.getByRole('link', { name: '接入设计' }))
    await waitFor(() => expect(api.markdown).toHaveBeenCalledOnce())
    view.rerender(<QueryClientProvider client={clients[0]}><Markdown text="新的会话" sessionId="next" /></QueryClientProvider>)
    await waitFor(() => expect(signal?.aborted).toBe(true))
    await act(async () => finish(file()))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.markdown).toHaveBeenCalledOnce()
  })

  it('文档中相对 Markdown 在同一弹框继续阅读并可返回', async () => {
    api.markdown.mockResolvedValueOnce(file('[下一份](child.markdown)'))
      .mockResolvedValueOnce(file('# 子文档', 'D:/project/docs/child.markdown'))
      .mockResolvedValue(file('[下一份](child.markdown)'))
    setup()
    fireEvent.click(screen.getByRole('link', { name: '接入设计' }))
    fireEvent.click(await screen.findByRole('link', { name: '下一份' }))
    expect(await screen.findByRole('heading', { name: '子文档' })).toBeVisible()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(api.markdown).toHaveBeenNthCalledWith(2, 'session', 'D:/project/docs/child.markdown', expect.any(AbortSignal))
    fireEvent.click(screen.getByRole('button', { name: '返回上一份文档' }))
    expect(await screen.findByRole('link', { name: '下一份' })).toBeVisible()
  })

  it('正文消毒 HTML，文档相对图片仍通过会话鉴权读取', async () => {
    api.markdown.mockResolvedValue(file('# 正文\n\n![图](images/proof.png)\n\n<style>body{display:none}</style><script>alert(1)</script><iframe src="https://example.org"></iframe><img src="bad.png" onerror="alert(1)">'))
    api.image.mockImplementation(() => new Promise(() => {}))
    setup()
    fireEvent.click(screen.getByRole('link', { name: '接入设计' }))
    await screen.findByRole('heading', { name: '正文' })
    expect(screen.getByRole('dialog').querySelector('script,style,iframe,[onerror]')).toBeNull()
    await waitFor(() => expect(api.image).toHaveBeenCalledWith('session', 'D:/project/docs/images/proof.png', expect.any(AbortSignal)))
  })

  it('外部文档保持网页链接，没有会话不能读取本地文档', () => {
    setup('[外部](https://example.org/a.md) [本地](./a.md)', '')
    expect(screen.getByRole('link', { name: '外部' })).toHaveAttribute('href', 'https://example.org/a.md')
    fireEvent.click(screen.getByRole('link', { name: '本地' }))
    expect(screen.getByText(/没有可用的会话/)).toBeVisible()
    expect(api.markdown).not.toHaveBeenCalled()
  })

  it('空文件明确提示，截断内容不伪装成完整预览', async () => {
    api.markdown.mockResolvedValueOnce(file(''))
      .mockResolvedValueOnce({ ...file('部分正文'), truncated: true })
    setup()
    fireEvent.click(screen.getByRole('link', { name: '接入设计' }))
    expect(await screen.findByText('这份 Markdown 文件为空。')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '重新读取 Markdown' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('未取得完整')
    expect(screen.queryByText('部分正文')).toBeNull()
  })
})
