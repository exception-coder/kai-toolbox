import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDevDocState } from './useDevDocState'

const api = vi.hoisted(() => ({
  getDevDocContent: vi.fn(),
  getSession: vi.fn(),
  saveDevDocContent: vi.fn(),
  startGenerateDevDoc: vi.fn(),
}))

vi.mock('../api', () => api)

describe('useDevDocState 后台任务恢复', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getSession.mockImplementation(() => new Promise(() => undefined))
  })

  afterEach(cleanup)

  it('首次进入页面时根据服务端快照恢复生成态和 Markdown 进度', async () => {
    const { result, unmount } = renderHook(() => useDevDocState({
      sessionId: 'session-1',
      hasDevDoc: false,
      active: true,
      workStatus: 'GENERATING',
      workProgress: 'Codex 正在生成执行计划',
      workContent: '## PLAN-001\n\n已恢复的后台快照',
    }))

    await waitFor(() => expect(result.current.streaming).toBe(true))
    expect(result.current.progress).toBe('Codex 正在生成执行计划')
    expect(result.current.content).toContain('PLAN-001')
    expect(api.getSession).toHaveBeenCalledWith('session-1')
    unmount()
  })

  it('重附着后发现任务完成时读取正式执行计划并结束生成态', async () => {
    api.getSession.mockResolvedValue({ devDocWorkStatus: 'DONE' })
    api.getDevDocContent.mockResolvedValue('# 正式执行计划')

    const { result } = renderHook(() => useDevDocState({
      sessionId: 'session-2',
      hasDevDoc: false,
      active: true,
      workStatus: 'GENERATING',
      workProgress: '正在保存执行计划',
      workContent: '# 临时快照',
    }))

    await waitFor(() => expect(result.current.streaming).toBe(false))
    expect(result.current.content).toBe('# 正式执行计划')
    expect(result.current.progress).toBe('')
  })
})
