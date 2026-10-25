import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Markdown } from './Markdown'
import { parseSitePreview } from '@/lib/sitePreview'
import { splitMessageBlocks } from '../lib/messageBlocks'

const declaration = '```site-preview\n{"title":"平台运行管理","url":"https://47.107.245.220/platform-management/applications?view=runtime"}\n```'
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('声明式站点预览', () => {
  it('只有点击才创建 iframe，全屏缩小不重载，关闭恢复焦点且不切换路由', async () => {
    const location = window.location.href
    const view = render(<Markdown sessionId="one" text={declaration} />)
    expect(document.querySelector('iframe')).toBeNull()
    const trigger = screen.getByRole('button', { name: /打开 平台运行管理/ })
    fireEvent.click(trigger)
    await act(() => vi.dynamicImportSettled())
    const frame = screen.getByTitle('平台运行管理 站点预览')
    expect(frame).toHaveAttribute('src', 'https://47.107.245.220/platform-management/applications?view=runtime')
    expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(frame.getAttribute('sandbox')).not.toMatch(/allow-top-navigation|allow-popups/)
    const external = screen.getByRole('link', { name: '在新窗口打开站点' })
    expect(external).toHaveAttribute('rel', 'noopener noreferrer')
    expect(external).toHaveAttribute('target', '_blank')
    fireEvent.click(screen.getByRole('button', { name: '全屏站点预览' }))
    expect(screen.getByRole('dialog')).toHaveClass('inset-0')
    fireEvent.click(screen.getByRole('button', { name: '缩小站点预览' }))
    expect(screen.getByTitle('平台运行管理 站点预览')).toBe(frame)
    view.rerender(<Markdown sessionId="one" text={`${declaration}\n继续输出`} />)
    expect(screen.getByTitle('平台运行管理 站点预览')).toBe(frame)
    fireEvent.click(screen.getByRole('button', { name: '关闭站点预览' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(trigger).toHaveFocus()
    expect(window.location.href).toBe(location)
  })

  it('跨域 load 不声称成功，刷新更换 iframe，切会话销毁预览', async () => {
    const view = render(<Markdown sessionId="one" text={declaration} />)
    fireEvent.click(screen.getByRole('button', { name: /打开 平台运行管理/ }))
    await act(() => vi.dynamicImportSettled())
    const frame = screen.getByTitle('平台运行管理 站点预览')
    fireEvent.load(frame)
    expect(screen.getByText(/无法确认跨站页面/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '刷新站点预览' }))
    expect(screen.getByTitle('平台运行管理 站点预览')).not.toBe(frame)
    fireEvent.load(screen.getByTitle('平台运行管理 站点预览'))
    expect(screen.getByText(/无法确认跨站页面/)).toBeVisible()
    view.rerender(<Markdown sessionId="two" text={declaration} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('长期没有 load 事件也结束等待，仍保留恢复入口', async () => {
    render(<Markdown text={declaration} />)
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: /打开 平台运行管理/ }))
    await act(() => vi.dynamicImportSettled())
    expect(screen.getByText('正在连接站点…')).toBeVisible()
    act(() => { vi.advanceTimersByTime(12_000) })
    expect(screen.queryByText('正在连接站点…')).toBeNull()
    expect(screen.getByRole('link', { name: '在新窗口打开站点' })).toBeVisible()
  })

  it('未闭合、嵌套示例和普通链接都不会变成站点入口', () => {
    const incomplete = declaration.slice(0, -3)
    const text = `${incomplete}\n\n[普通站点](https://example.com)`
    const view = render(<Markdown text={text} />)
    expect(screen.queryByRole('button', { name: /打开 平台/ })).toBeNull()
    view.rerender(<Markdown text={`\`\`\`\`markdown\n${declaration}\n\`\`\`\`\n\n[普通站点](https://example.com)`} />)
    expect(screen.queryByRole('button', { name: /打开 平台/ })).toBeNull()
    expect(screen.getByRole('link', { name: '普通站点' })).toHaveAttribute('href', 'https://example.com')
  })

  it('错误声明保留反馈，不执行原始 HTML', () => {
    render(<Markdown text={'```site-preview\n{"url":"javascript:alert(1)"}\n```\n<iframe src="https://example.com"></iframe>'} />)
    expect(screen.getByRole('alert')).toHaveTextContent('无法打开站点预览')
    expect(document.querySelector('iframe')).toBeNull()
  })

  it.each([
    '{"url":"javascript:alert(1)"}', '{"url":"data:text/html,hi"}',
    '{"url":"//example.com"}', '{"url":"https://user:password@example.com"}',
    '{"url":"https://example.com","password":"not-for-preview"}',
    '{"url":"https://forge.test/tools/claude-chat"}', '[]', 'null',
  ])('拒绝执行性、凭据或 Forge 同源地址 %s', code => {
    expect(() => parseSitePreview(code, 'https://forge.test')).toThrow()
  })

  it('HTTP/HTTPS 合法地址与无标题声明可用，保留查询与锚点', () => {
    expect(parseSitePreview('{"url":"http://localhost:8081/app?view=runtime#details"}', 'https://forge.test')).toEqual({ title: 'localhost:8081', url: 'http://localhost:8081/app?view=runtime#details' })
  })

  it('保留完整特殊围栏之间的原文，包括外层示例、CRLF 和较长围栏', () => {
    const source = '开头\r\n\r\n~~~~site-preview\r\n{"url":"https://example.com"}\r\n~~~~\r\n结尾'
    expect(splitMessageBlocks(source)).toEqual([{ kind: 'text', content: '开头\n\n' }, { kind: 'site-preview', code: '{"url":"https://example.com"}' }, { kind: 'text', content: '结尾' }])
  })
})
