import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Markdown } from './Markdown'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const openPath = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const readDiagram = vi.hoisted(() => vi.fn())
const readImage = vi.hoisted(() => vi.fn())
vi.mock('../api', () => ({ openSessionLocalPath: openPath, readSessionDiagram: readDiagram, readSessionImage: readImage }))
vi.mock('@/features/doc-viewer/public-api/drawio', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/doc-viewer/public-api/drawio')>()
  return { ...actual, DrawioPreview: ({ name }: { name: string }) => <div>图画布：{name}</div> }
})
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('消息本地路径', () => {
  it('本地图读取失败显示真实原因，重试重新鉴权读取', async () => {
    vi.stubGlobal('URL', Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => 'blob:retried-proof'), revokeObjectURL: vi.fn(),
    }))
    readImage.mockRejectedValueOnce(new Error('图片文件不存在或不可读'))
      .mockResolvedValueOnce(new Blob(['image'], { type: 'image/png' }))
    render(<Markdown text="![失败截图](D:/project/proof.png)" sessionId="session" />)
    expect(await screen.findByText('图片文件不存在或不可读')).toBeVisible()
    fireEvent.click(screen.getByRole('button', {name:'重试图片 失败截图'}))
    expect(await screen.findByAltText('失败截图')).toHaveAttribute('src', 'blob:retried-proof')
    expect(readImage).toHaveBeenCalledTimes(2)
  })

  it('切换会话取消旧图片读取，迟到内容不创建对象地址', async () => {
    const create = vi.fn(() => 'blob:late')
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL:create, revokeObjectURL:vi.fn() }))
    let finish!: (blob: Blob) => void, signal!: AbortSignal
    readImage.mockImplementationOnce((_id, _path, input) => { signal = input; return new Promise(resolve => { finish = resolve }) })
    const view = render(<Markdown text="![旧图](D:/project/old.png)" sessionId="old" />)
    await waitFor(() => expect(readImage).toHaveBeenCalledTimes(1))
    view.rerender(<Markdown text="新会话" sessionId="new" />)
    expect(signal.aborted).toBe(true)
    await act(async () => finish(new Blob(['image'], {type:'image/png'})))
    await waitFor(() => expect(screen.queryByAltText('旧图')).toBeNull())
    expect(create).not.toHaveBeenCalled()
    expect(readImage).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['D:/Project/.git/proof.png', 'D:/Project/.git/proof.png'],
    ['/D:/My%20Project/截图.png', 'D:/My Project/截图.png'],
    ['file:///D:/My%20Project/截图.png', 'D:/My Project/截图.png'],
    ['./outputs/proof.png', './outputs/proof.png'],
    ['outputs/proof.png', 'outputs/proof.png'],
    ['/home/user/proof.png', '/home/user/proof.png'],
  ])('本地图 %s 通过当前会话鉴权读取，不交给浏览器加载磁盘协议', async (href, expected) => {
    const revoke = vi.fn()
    vi.stubGlobal('URL', Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => 'blob:local-proof'), revokeObjectURL: revoke,
    }))
    readImage.mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
    const view = render(<Markdown text={`![核验截图](${href})`} sessionId="session" />)
    await waitFor(() => expect(readImage).toHaveBeenCalledWith('session', expected, expect.any(AbortSignal)))
    const image = await screen.findByAltText('核验截图')
    expect(image).toHaveAttribute('src', 'blob:local-proof')
    fireEvent.load(image)
    expect(image).toBeVisible()
    view.unmount()
    expect(revoke).toHaveBeenCalledWith('blob:local-proof')
  })

  it.each([
    '/tools/fore-consult/preview?auto=1&requestKey=abc&route=%2Femployees#screen',
    '/tools/reqpool/resources?view=accounts', '/api/page-previews/id/screenshot',
  ])('站内网页 %s 保留查询与锚点，不当作本地文件', href => {
    render(<Markdown text={`[页面](${href})`} sessionId="session" />)
    const link = screen.getByRole('link', { name: '页面' })
    expect(link).toHaveAttribute('href', href)
    expect(link).not.toHaveAttribute('data-local-path')
    expect(openPath).not.toHaveBeenCalled()
  })
  it.each([
    ['/D:/Project/架构.drawio', 'D:/Project/架构.drawio'],
    ['file:///D:/My%20Project/架构.drawio', 'D:/My Project/架构.drawio'],
    ['docs/架构.drawio.xml', 'docs/架构.drawio.xml'],
    ['./架构.drawio#L2', './架构.drawio'],
  ])('点击图文件 %s 页内预览，关闭恢复原链接焦点', async (href, expected) => {
    readDiagram.mockResolvedValue({ name: '架构.drawio', content: '<mxGraphModel/>', size: 15, binary: false, truncated: false })
    const client = new QueryClient()
    render(<QueryClientProvider client={client}><Markdown text={`[查看架构](${href})`} sessionId="session" /></QueryClientProvider>)
    const link = screen.getByRole('link', { name: '查看架构' })
    fireEvent.click(link)
    expect(await screen.findByText('图画布：架构.drawio')).toBeVisible()
    expect(readDiagram).toHaveBeenCalledWith('session', expected, expect.any(AbortSignal))
    expect(openPath).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '关闭图文件预览' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(link).toHaveFocus()
    client.clear()
  })

  it('外部图链接保持原链接，没有会话时说明原因而不读取', () => {
    render(<Markdown text={'[外链](https://example.org/架构.drawio) [本地图](./架构.drawio)'} />)
    expect(screen.getByRole('link', { name: '外链' })).toHaveAttribute('href', 'https://example.org/%E6%9E%B6%E6%9E%84.drawio')
    fireEvent.click(screen.getByRole('link', { name: '本地图' }))
    expect(screen.getByText(/没有可用的会话/)).toBeVisible()
    expect(readDiagram).not.toHaveBeenCalled()
  })

  it('读取失败可以重试，失败不打开系统程序，关闭取消迟到读取', async () => {
    const client = new QueryClient()
    readDiagram.mockRejectedValueOnce(new Error('路径不属于当前会话或项目工作台'))
    let cancelled: AbortSignal | undefined
    readDiagram.mockImplementationOnce((_session, _path, signal) => { cancelled = signal; return new Promise(() => {}) })
    render(<QueryClientProvider client={client}><Markdown text="[架构](./架构.drawio)" sessionId="session" /></QueryClientProvider>)
    fireEvent.click(screen.getByRole('link', { name: '架构' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('路径不属于')
    fireEvent.click(screen.getByRole('button', { name: '重试读取' }))
    await waitFor(() => expect(readDiagram).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: '关闭图文件预览' }))
    await waitFor(() => expect(cancelled?.aborted).toBe(true))
    expect(openPath).not.toHaveBeenCalled()
    client.clear()
  })

  it('切换会话立即取消原图读取，不用新会话读取旧链接', async () => {
    const client = new QueryClient()
    let cancelled: AbortSignal | undefined
    readDiagram.mockImplementationOnce((_session, _path, signal) => { cancelled = signal; return new Promise(() => {}) })
    const view = render(<QueryClientProvider client={client}><Markdown text="[图](./旧图.drawio)" sessionId="old" /></QueryClientProvider>)
    fireEvent.click(screen.getByRole('link', { name: '图' }))
    await waitFor(() => expect(readDiagram).toHaveBeenCalledTimes(1))
    view.rerender(<QueryClientProvider client={client}><Markdown text="新的会话" sessionId="new" /></QueryClientProvider>)
    await waitFor(() => expect(cancelled?.aborted).toBe(true))
    expect(readDiagram).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    client.clear()
  })

  it.each([
    ['/D:/Project/yoooni-one/tasks.md', 'D:/Project/yoooni-one/tasks.md'],
    ['/D:/Project/My%20Project/tasks.md', 'D:/Project/My Project/tasks.md'],
    ['/home/user/tasks.md', '/home/user/tasks.md'],
  ])('打开 %s 时传递有效系统路径', async (href, expected) => {
    render(<Markdown text={`[任务](${href})`} sessionId="session" />)
    fireEvent.click(screen.getByRole('link', { name: '任务' }))
    await waitFor(() => expect(openPath).toHaveBeenCalledWith('session', expected))
  })

  it('shows image loading and recovery instead of a broken image, then loads the retry successfully', () => {
    render(<Markdown text="[![手机页面验证](/missing-proof.png)](/D:/project/proof.png)" sessionId="session" />)
    expect(screen.getByText('正在加载图片…')).toBeVisible()
    fireEvent.error(screen.getByAltText('手机页面验证'))
    expect(screen.queryByAltText('手机页面验证')).not.toBeInTheDocument()
    expect(screen.getByText(/图片加载失败 · 手机页面验证/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '重试图片 手机页面验证' }))
    const image = screen.getByAltText('手机页面验证')
    expect(image).toHaveAttribute('src', '/missing-proof.png')
    expect(openPath).not.toHaveBeenCalled()
    fireEvent.load(image)
    expect(screen.queryByText('正在加载图片…')).not.toBeInTheDocument()
    expect(image).toBeVisible()
  })

  it('resets image state on content replacement and sanitizes executable image attributes', () => {
    const view = render(<Markdown text="![旧截图](/old.png)" />)
    fireEvent.error(screen.getByAltText('旧截图'))
    view.rerender(<Markdown text={'<img src="/new.png" alt="新截图" onerror="alert(1)">'} />)
    expect(screen.queryByText(/图片加载失败/)).not.toBeInTheDocument()
    const image = screen.getByAltText('新截图')
    expect(image).not.toHaveAttribute('onerror')
    fireEvent.load(image)
    expect(image).toBeVisible()
  })
})
