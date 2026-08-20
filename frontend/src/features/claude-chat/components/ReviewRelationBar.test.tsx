import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reissueReviewShare, type ReviewRelationContext } from '../api'
import { ReviewRelationBar, reviewDisplayState } from './ReviewRelationBar'

vi.mock('../api', async importOriginal => ({
  ...await importOriginal<typeof import('../api')>(),
  reissueReviewShare: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const relation: ReviewRelationContext = {
  role: 'SOURCE',
  sourceSessionId: 'source-1',
  sourceTitle: '开发会话',
  lanIpv4: '192.168.100.102',
  pendingFeedback: [],
  reviews: [
    {
      id: 'review-space-2', sourceSessionId: 'source-1', reviewSessionId: 'review-session-2',
      mode: 'FULL_FORK', status: 'ACTIVE', title: '第二次评审', sourceTitle: '开发会话',
      reviewTitle: '第二次评审', sharePath: '/review/original-token',
      createdAt: 2_000, expiresAt: Date.now() + 86_400_000,
    },
    {
      id: 'review-space-1', sourceSessionId: 'source-1', reviewSessionId: 'review-session-1',
      mode: 'SAFE_SNAPSHOT', status: 'ACTIVE', title: '第一次评审', sourceTitle: '开发会话',
      reviewTitle: '第一次评审', sharePath: null, createdAt: 1_000, expiresAt: 1,
    },
  ],
}

describe('ReviewRelationBar', () => {
  it('展开后展示全部历史评审并可进入指定分析会话', () => {
    const openSession = vi.fn()
    render(<ReviewRelationBar relation={relation} onOpenSession={openSession} />)

    expect(screen.getByText('2 次 · 最近：第二次评审')).toBeInTheDocument()
    expect(screen.queryByText('第一次评审')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /查看记录/ }))
    expect(screen.getByText('第一次评审')).toBeInTheDocument()
    expect(screen.getByText('原始评审链接')).toBeInTheDocument()
    expect(screen.getByTitle(/^http:\/\/192\.168\.100\.102(?::\d+)?\/review\/original-token$/)).toBeInTheDocument()
    expect(screen.getByText('原链接创建时未留存，无法从安全摘要恢复。')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '打开分析' })).toHaveLength(2)

    fireEvent.click(screen.getAllByRole('button', { name: '打开分析' })[1])
    expect(openSession).toHaveBeenCalledWith('review-session-1')
  })

  it('过期记录可重新签发局域网链接并刷新关联数据', async () => {
    vi.mocked(reissueReviewShare).mockResolvedValue({
      review: relation.reviews[1], token: 'new-token', sharePath: '/review/new-token', lanIpv4: '192.168.100.102',
    })
    const changed = vi.fn()
    render(<ReviewRelationBar relation={relation} onOpenSession={vi.fn()} onChanged={changed} />)
    fireEvent.click(screen.getByRole('button', { name: /查看记录/ }))

    fireEvent.click(screen.getByRole('button', { name: /生成替代链接/ }))
    expect(screen.getByText('将生成一个替代链接；旧地址若仍存在会立即失效。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '确认生成' }))

    await waitFor(() => expect(reissueReviewShare).toHaveBeenCalledWith('review-space-1'))
    expect(await screen.findByText('新链接已生成，之前的公开链接已失效')).toBeInTheDocument()
    expect(screen.getByTitle(/^http:\/\/192\.168\.100\.102(?::\d+)?\/review\/new-token$/)).toBeInTheDocument()
    expect(changed).toHaveBeenCalled()
  })

  it('区分有效、过期和撤销状态', () => {
    expect(reviewDisplayState(relation.reviews[0], 10).label).toBe('有效')
    expect(reviewDisplayState(relation.reviews[1], 10).label).toBe('已过期')
    expect(reviewDisplayState({ ...relation.reviews[0], status: 'REVOKED' }, 10).label).toBe('已撤销')
  })
})
