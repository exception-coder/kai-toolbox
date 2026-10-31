import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'

vi.mock('@/lib/auth', () => ({
  emitSessionExpired: vi.fn(),
  ensureFreshToken: vi.fn().mockResolvedValue(undefined),
  withAuthToken: (path: string) => path,
}))

import { confirmQueueAndContinue, dispatchQueuedMessage, listQueuedMessages } from './api'

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

const commands = [
  { name: '确认继续', run: () => confirmQueueAndContinue('session/one'), path: '/api/claude-chat/sessions/session%2Fone/queue/confirm' },
  { name: '立即发送', run: () => dispatchQueuedMessage('session/one', 'message/one'), path: '/api/claude-chat/sessions/session%2Fone/queue/message%2Fone/dispatch' },
]

describe('队列命令 HTTP 返回约定', () => {
  it.each(commands)('$name：202 空响应表示已受理，不误报 JSON 解析失败或重复发请求', async ({ run, path }) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(run()).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(path, expect.objectContaining({ method: 'POST' }))
  })

  it.each(commands)('$name：真实拒绝仍保留错误状态与原因', async ({ run }) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: '当前用户不能访问该会话' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    })))
    await expect(run()).rejects.toMatchObject({ status: 403, message: '当前用户不能访问该会话' } satisfies Partial<ApiError>)
  })

  it('需要 JSON 的队列查询遇到空响应仍报错，不全局吞掉无效返回', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))
    await expect(listQueuedMessages('session')).rejects.toBeInstanceOf(SyntaxError)
  })
})
