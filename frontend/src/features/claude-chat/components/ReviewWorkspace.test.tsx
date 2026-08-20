import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import type { ReviewRelationContext } from '../api'
import { ReviewWorkspace } from './ReviewWorkspace'

afterEach(cleanup)

const relation: ReviewRelationContext = {
  role: 'SOURCE',
  sourceSessionId: 'source-1',
  sourceTitle: '开发会话',
  lanIpv4: '192.168.100.102',
  reviews: [{
    id: 'review-space-1',
    sourceSessionId: 'source-1',
    reviewSessionId: 'review-session-1',
    mode: 'SAFE_SNAPSHOT',
    status: 'ACTIVE',
    title: '计划评审',
    sourceTitle: '开发会话',
    reviewTitle: '计划评审',
    sharePath: '/review/original-token',
    createdAt: 1_000,
    expiresAt: Date.now() + 86_400_000,
  }],
  pendingFeedback: [{
    id: 'feedback-1',
    reviewSpaceId: 'review-space-1',
    sourceSessionId: 'source-1',
    reviewSessionId: 'review-session-1',
    content: '补充移动端验收场景',
    sourceMessageId: 'message-1',
    status: 'PENDING',
    createdAt: 2_000,
    handledAt: null,
  }],
}

describe('ReviewWorkspace', () => {
  it('在页签内容中同时展示历史记录和待处理意见', () => {
    const applyFeedbacks = vi.fn()
    render(
      <ConfirmProvider>
        <ReviewWorkspace
          relation={relation}
          feedbackBusy={false}
          feedbackError={null}
          onOpenSession={vi.fn()}
          onChanged={vi.fn()}
          onApplyFeedbacks={applyFeedbacks}
          onDismissFeedback={vi.fn()}
        />
      </ConfirmProvider>,
    )

    expect(screen.getByText('待处理评审意见 · 1 条')).toBeInTheDocument()
    expect(screen.getByText('计划评审')).toBeInTheDocument()
    expect(screen.getByText('原始评审链接')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '生成开发草稿' }))
    expect(applyFeedbacks).toHaveBeenCalledWith([relation.pendingFeedback[0]])
  })
})
