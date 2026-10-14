import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Markdown } from './Markdown'

const openPath = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('../api', () => ({ openSessionLocalPath: openPath }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('消息本地路径', () => {
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
