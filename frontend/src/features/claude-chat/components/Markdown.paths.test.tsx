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
})
