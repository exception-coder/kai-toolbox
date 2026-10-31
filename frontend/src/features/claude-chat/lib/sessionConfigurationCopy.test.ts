import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { acknowledgeSessionCopy, copySessionConfiguration } from './sessionConfigurationCopy'

const request = vi.hoisted(() => vi.fn())
vi.mock('../api', () => ({ requestSessionCopy: request }))
afterEach(() => { vi.resetAllMocks(); localStorage.clear() })
const reply = (sourceSessionId: string, requestId: string) => Promise.resolve({ sourceSessionId, requestId, targetSessionId: 'target' })

describe('复制配置的持久请求核对', () => {
  it('丢失回执后用原编号重试，确认成功才清除编号', async () => {
    request.mockRejectedValueOnce(new TypeError('网络中断')).mockImplementation(reply)
    const result = await copySessionConfiguration('source')
    expect(result).toMatchObject({ targetSessionId: 'target' })
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[0][1]).toBe(request.mock.calls[1][1])
    expect(localStorage.getItem('kai-toolbox:pending-session-copy:source')).toBe(result.requestId)
    acknowledgeSessionCopy(result)
    expect(localStorage.getItem('kai-toolbox:pending-session-copy:source')).toBeNull()
  })

  it('三次失败后保留编号，刷新后的再次调用仍核对原请求', async () => {
    request.mockRejectedValue(new Error('连接失败'))
    await expect(copySessionConfiguration('source')).rejects.toThrow('连接失败')
    expect(request).toHaveBeenCalledTimes(3)
    const originalId = request.mock.calls[0][1]
    expect(localStorage.getItem('kai-toolbox:pending-session-copy:source')).toBe(originalId)
    request.mockImplementation(reply)
    await copySessionConfiguration('source')
    expect(request.mock.calls[3][1]).toBe(originalId)
  })

  it('明确拒绝不重试，也不接受属于其他源会话的回执', async () => {
    request.mockRejectedValueOnce(new ApiError(403, null, '无权复制'))
    await expect(copySessionConfiguration('source')).rejects.toThrow('无权复制')
    expect(request).toHaveBeenCalledOnce()
    request.mockResolvedValue({ requestId: 'wrong', sourceSessionId: 'other', targetSessionId: 'wrong' })
    await expect(copySessionConfiguration('source')).rejects.toThrow('复制回执不匹配')
    expect(localStorage.getItem('kai-toolbox:pending-session-copy:source')).not.toBeNull()
  })
})
