import { describe, expect, it } from 'vitest'
import {
  isCurrentSessionHistoryRequest,
  isSessionHistoryPageExhausted,
  sessionHistoryLoadErrorMessage,
} from './sessionHistoryRequest'

describe('isCurrentSessionHistoryRequest', () => {
  it('只允许当前会话的最新历史请求回写', () => {
    expect(isCurrentSessionHistoryRequest(
      { requestId: 4, sessionId: 'session-b' },
      4,
      'session-b',
    )).toBe(true)
  })

  it('拒绝切换会话前仍在执行的历史请求', () => {
    expect(isCurrentSessionHistoryRequest(
      { requestId: 3, sessionId: 'session-a' },
      4,
      'session-b',
    )).toBe(false)
  })

  it('即使请求编号相同也拒绝写入其他会话', () => {
    expect(isCurrentSessionHistoryRequest(
      { requestId: 4, sessionId: 'session-a' },
      4,
      'session-b',
    )).toBe(false)
  })
})

describe('sessionHistoryLoadErrorMessage', () => {
  it('将超时和取消归一为可重试的超时提示', () => {
    expect(sessionHistoryLoadErrorMessage({ name: 'TimeoutError' })).toBe('加载更早消息超时，请点击重试')
    expect(sessionHistoryLoadErrorMessage({ name: 'AbortError' })).toBe('加载更早消息超时，请点击重试')
  })

  it('普通失败不泄露底层异常，提供明确重试动作', () => {
    expect(sessionHistoryLoadErrorMessage(new Error('internal url'))).toBe('加载更早消息失败，请点击重试')
  })
})

describe('isSessionHistoryPageExhausted', () => {
  it('识别服务端终点、空页和游标无进展', () => {
    expect(isSessionHistoryPageExhausted(30, 120, null)).toBe(true)
    expect(isSessionHistoryPageExhausted(0, 120, 90)).toBe(true)
    expect(isSessionHistoryPageExhausted(30, 120, 120)).toBe(true)
  })

  it('游标正常前进时允许继续加载', () => {
    expect(isSessionHistoryPageExhausted(30, 120, 90)).toBe(false)
  })
})
