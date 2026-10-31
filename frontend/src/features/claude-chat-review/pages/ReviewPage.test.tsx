import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { ReviewPage } from './ReviewPage'

const calls = vi.hoisted(() => ({ switchTo: vi.fn(), send: vi.fn(), enqueue: vi.fn(), interrupt: vi.fn(), restoreReading: vi.fn() }))
vi.mock('@/features/claude-chat/public-api', async () => {
  const React = await import('react')
  return {
    getPublicReview: vi.fn().mockResolvedValue({ reviewSessionId: 'review', title: '需求评审', sourceTitle: '原开发计划', mode: 'SAFE_SNAPSHOT', createdAt: 1, contextSnapshot: '上下文依据' }),
    loadPublicReviewMessages: vi.fn().mockResolvedValue({ items: [], nextBefore: null }),
    getPublicReviewBacklog: vi.fn().mockResolvedValue({ items: [], processedSources: [] }),
    getPublicReviewDelivery: vi.fn().mockResolvedValue({ targetProject: 'project', tasks: [], submissions: [] }),
    useMobileViewport: () => true,
    useClaudeChatSocket: () => ({ ...calls, state: 'ready', running: true, items: [], queued: [], backgroundTasks: [], pending: null, loadHistory: vi.fn() }),
    MessageList: React.forwardRef((_props, ref) => {
      React.useImperativeHandle(ref, () => ({ captureReadingPosition: () => calls.restoreReading }))
      return <div data-testid="conversation-stream">原会话消息</div>
    }),
    AttachmentChips: () => null, QueuedList: () => null, ReviewContextOverview: () => <p>上下文依据</p>,
    Markdown: ({ text }: { text: string }) => <p>{text}</p>, reviewTodoStatusLabel: {},
  }
})
vi.mock('../components/ReviewEnvironmentCheck', () => ({ ReviewEnvironmentCheck: () => null }))
afterEach(cleanup)
it('opens a compact backlog without remounting the conversation, losing the draft or changing the task', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/review/token']}><Routes><Route path="/review/:token" element={<ReviewPage />} /></Routes></MemoryRouter></QueryClientProvider>)
  const stream = await screen.findByTestId('conversation-stream')
  const input = screen.getByRole('textbox', { name: '评审消息' })
  fireEvent.change(input, { target: { value: '未发送的讨论草稿' } })
  expect(screen.queryByText('提交最新一条')).not.toBeInTheDocument()
  expect(screen.queryByText('关联计划：原开发计划')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /需求清单 · 0 项/ }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '关闭需求清单' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByTestId('conversation-stream')).toBe(stream)
  expect(screen.getByRole('textbox', { name: '评审消息' })).toHaveValue('未发送的讨论草稿')
  expect(calls.switchTo).toHaveBeenCalledExactlyOnceWith('review')
  expect(calls.send).not.toHaveBeenCalled()
  expect(calls.enqueue).not.toHaveBeenCalled()
  expect(calls.interrupt).not.toHaveBeenCalled()
  await waitFor(() => expect(calls.restoreReading).toHaveBeenCalled())
  client.clear()
})
