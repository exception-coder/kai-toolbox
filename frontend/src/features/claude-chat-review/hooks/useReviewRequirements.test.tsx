import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useReviewRequirements } from './useReviewRequirements'
import { getPublicReviewBacklog, synchronizePublicReviewRequirements } from '@/features/claude-chat/public-api'

vi.mock('@/features/claude-chat/public-api', () => ({ getPublicReviewBacklog: vi.fn(), synchronizePublicReviewRequirements: vi.fn(), confirmPublicReviewRequirement: vi.fn(), deletePublicReviewRequirement: vi.fn(), mergePublicReviewRequirements: vi.fn(), updatePublicReviewRequirement: vi.fn() }))
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getPublicReviewBacklog).mockResolvedValue({ items: [], processedSources: [] }) })
const draft = { sourceMessageId: 'assistant-content-v1:test', title: '布局调整', content: '### 问题结论\n聊天太少\n### 修改建议\n收起说明\n### 验收标准\n能看到更多消息', sourceText: '优化布局', analysisText: '缩小顶部' }
it('keeps detected suggestions as candidates until the reviewer explicitly adds one', async () => {
  vi.mocked(synchronizePublicReviewRequirements).mockResolvedValue([])
  const { result } = renderHook(() => useReviewRequirements('token', [draft]))
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.candidates).toHaveLength(1)
  expect(synchronizePublicReviewRequirements).not.toHaveBeenCalled()
  await act(async () => { await result.current.add(draft) })
  expect(synchronizePublicReviewRequirements).toHaveBeenCalledTimes(1)
  expect(vi.mocked(synchronizePublicReviewRequirements).mock.calls[0][1][0].content).toContain('## 预期行为\n收起说明')
  expect(result.current.candidates).toHaveLength(0)
})
it('ignores a late backlog result from a different review capability', async () => {
  let finish!: (value: { items: []; processedSources: string[] }) => void
  vi.mocked(getPublicReviewBacklog).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const { result, rerender } = renderHook(({ token }) => useReviewRequirements(token, [draft]), { initialProps: { token: 'old' } })
  rerender({ token: 'new' })
  await waitFor(() => expect(result.current.loading).toBe(false))
  await act(async () => { finish({ items: [], processedSources: [draft.sourceMessageId] }) })
  expect(result.current.candidates).toHaveLength(1)
})
