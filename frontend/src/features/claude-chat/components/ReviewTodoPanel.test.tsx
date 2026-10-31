import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { ReviewTodoPanel } from './ReviewTodoPanel'
import { confirmReviewTodos, editReviewTodo, listReviewTodos, type ReviewTodo } from '../api'

vi.mock('../api', () => ({ listReviewTodos: vi.fn(), editReviewTodo: vi.fn(), confirmReviewTodos: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const task: ReviewTodo = { id: 'one', sourceSessionId: 'source', reviewSpaceId: 'space', feedbackId: 'feedback',
  requirementId: 'requirement', sourceRevision: 1, version: 2, title: '新增字段', content: '字段及验收', status: 'WAITING',
  messageId: null, note: null, createdAt: 1, updatedAt: 1 }
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(<QueryClientProvider client={client}><ReviewTodoPanel sourceSessionId="source" onChanged={vi.fn()} /></QueryClientProvider>)
}
it('requires selection, confirms exact versions with merge and retains returned queued progress', async () => {
  vi.mocked(listReviewTodos).mockResolvedValue([task])
  vi.mocked(confirmReviewTodos).mockResolvedValue([{ ...task, status: 'QUEUED', messageId: 'queue-one' }])
  mount()
  const select = await screen.findByRole('checkbox', { name: '选择 新增字段' })
  expect(screen.getByRole('button', { name: '确认并执行' })).toBeDisabled()
  fireEvent.click(select)
  fireEvent.click(screen.getByRole('checkbox', { name: '合并为一项执行' }))
  fireEvent.click(screen.getByRole('button', { name: '确认并执行（1）' }))
  await screen.findByText('待执行')
  expect(confirmReviewTodos).toHaveBeenCalledExactlyOnceWith('source', [{ id: 'one', version: 2 }], true)
  expect(screen.getByRole('status')).toHaveTextContent('已确认并登记执行队列')
})
it('keeps a failed edit draft and requires selection again after a successful edit', async () => {
  vi.mocked(listReviewTodos).mockResolvedValue([task])
  vi.mocked(editReviewTodo).mockRejectedValueOnce(new Error('版本冲突')).mockResolvedValueOnce({ ...task, title: '修改后标题', version: 3 })
  mount()
  fireEvent.click(await screen.findByRole('checkbox', { name: '选择 新增字段' }))
  fireEvent.click(screen.getByRole('button', { name: '调整待办' }))
  const title = screen.getByRole('textbox', { name: '待办标题' })
  fireEvent.change(title, { target: { value: '修改后标题' } })
  fireEvent.click(screen.getByRole('button', { name: '保存待办' }))
  await screen.findByRole('alert')
  expect(title).toHaveValue('修改后标题')
  fireEvent.click(screen.getByRole('button', { name: '保存待办' }))
  await waitFor(() => expect(screen.queryByRole('textbox', { name: '待办标题' })).not.toBeInTheDocument())
  expect(screen.getByRole('button', { name: '确认并执行' })).toBeDisabled()
  expect(confirmReviewTodos).not.toHaveBeenCalled()
})
