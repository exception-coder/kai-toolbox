import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ConsultSuggestions } from './ConsultSuggestions'
import { listSuggestions, normalizeSuggestion, submitSuggestion, retrySuggestionReview, readDevelopmentSession, type SuggestionDraft } from '../suggestionApi'
vi.mock('../suggestionApi', () => ({ listSuggestions: vi.fn(), normalizeSuggestion: vi.fn(), submitSuggestion: vi.fn(), retrySuggestionReview: vi.fn(), readDevelopmentSession: vi.fn() }))
const draft: SuggestionDraft = { title: '手机快速回到最新消息', problem: '长回答不容易定位', expected: '点击回到最新消息', acceptance: '' }
const saved = { ...draft, id: 'saved', original: '手机长回答不好找', createdAt: 1 }
let client: QueryClient
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  vi.mocked(listSuggestions).mockResolvedValue({ items: [], total: 0 })
  vi.mocked(normalizeSuggestion).mockResolvedValue(draft)
  vi.mocked(readDevelopmentSession).mockResolvedValue({ id: null, title: '后台开发会话', messages: [], hasMore: false, nextBefore: 0 })
})
afterEach(() => { cleanup(); client.clear(); sessionStorage.clear(); vi.resetAllMocks() })
function mount(open = true, userId = 7, compact = false) {
  const close = vi.fn()
  render(<QueryClientProvider client={client}><ConsultSuggestions userId={userId} open={open} onOpenChange={close} compact={compact} /></QueryClientProvider>)
  return close
}

it('opens the independent background session without losing the feedback draft', async () => {
  vi.mocked(readDevelopmentSession).mockResolvedValue({ id: 'consult-suggestion-development', title: '后台开发会话', messages: [
    { sequence: 2, suggestionId: 'suggestion-1', phase: '待发布', content: '代码已提交，尚未发布', createdAt: 1 },
    { sequence: 1, suggestionId: 'suggestion-1', phase: '实现中', content: '开始后台编码', createdAt: 0 },
  ], hasMore: false, nextBefore: 1 })
  mount(true, 7, true)
  fireEvent.change(screen.getByLabelText('你的原始建议'), { target: { value: '保留我的新建议' } })
  fireEvent.click(screen.getByRole('button', { name: '开发会话' }))
  expect(await screen.findByText('代码已提交，尚未发布')).toBeInTheDocument()
  expect(screen.getByText('开始后台编码')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '需求建议' }))
  expect(screen.getByLabelText('你的原始建议')).toHaveValue('保留我的新建议')
  expect(submitSuggestion).not.toHaveBeenCalled()
})

it('distinguishes review, rejection and committed-but-not-published results', async () => {
  vi.mocked(listSuggestions).mockResolvedValue({ items: [
    { ...saved, id: 'rejected', title: '扩大查询范围', state: 'REJECTED', reason: '涉及权限放开，不予接收' },
    { ...saved, id: 'committed', title: '阅读文字改进', state: 'COMMITTED', commitHash: 'a'.repeat(40), reason: '独立分支等待合并' },
    { ...saved, id: 'retry', title: '审核未完成的建议', state: 'REVIEW_FAILED' },
  ], total: 3 })
  vi.mocked(retrySuggestionReview).mockResolvedValue(undefined)
  mount(true, 7, true)
  expect(await screen.findByText(/未通过审核 ·/)).toBeInTheDocument()
  expect(screen.getByText('涉及权限放开，不予接收')).toBeInTheDocument()
  expect(screen.getByText(/提交 aaaaaaaa · 尚未发布/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重试审核（仅提交人）' }))
  await screen.findByText('已重新排队审核。')
  expect(retrySuggestionReview).toHaveBeenCalledWith('retry')
})

it('retains raw feedback, lets users edit normalization and safely retries the same submission', async () => {
  vi.mocked(submitSuggestion).mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce(saved)
  mount()
  const dialog = within(screen.getByRole('dialog'))
  fireEvent.change(dialog.getByLabelText('你的原始建议'), { target: { value: saved.original } })
  fireEvent.click(dialog.getByRole('button', { name: '整理成需求描述' }))
  await waitFor(() => expect(dialog.getByLabelText('需求标题')).toHaveValue(draft.title))
  expect(normalizeSuggestion).toHaveBeenCalledWith(saved.original)
  fireEvent.change(dialog.getByLabelText('需求标题'), { target: { value: '手机添加回到最新消息按钮' } })
  fireEvent.click(dialog.getByRole('button', { name: '提交建议' }))
  await dialog.findByRole('alert')
  const [key, original, submittedDraft] = vi.mocked(submitSuggestion).mock.calls[0]
  expect(original).toBe(saved.original)
  expect(submittedDraft.title).toBe('手机添加回到最新消息按钮')
  expect(dialog.getByLabelText('你的原始建议')).toHaveValue(saved.original)
  fireEvent.click(dialog.getByRole('button', { name: '提交建议' }))
  await dialog.findByText(/建议已保存，正在等待审核/)
  expect(vi.mocked(submitSuggestion).mock.calls[1][0]).toBe(key)
  expect(dialog.getByLabelText('你的原始建议')).toHaveValue('')
})

it('keeps the draft after normalization failure and allows manual completion', async () => {
  vi.mocked(normalizeSuggestion).mockRejectedValueOnce(new Error('engine unavailable'))
  mount(true, 8, true)
  expect(screen.queryByLabelText('业务咨询需求建议卡片')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('你的原始建议'), { target: { value: '希望历史更好用' } })
  fireEvent.click(screen.getByRole('button', { name: '整理成需求描述' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('你的原始建议')).toHaveValue('希望历史更好用')
  fireEvent.change(screen.getByLabelText('需求标题'), { target: { value: '历史快速定位' } })
  fireEvent.change(screen.getByLabelText('遇到的问题'), { target: { value: '找不到记录' } })
  fireEvent.change(screen.getByLabelText('期望改进'), { target: { value: '按关键词搜索记录' } })
  expect(screen.getByRole('button', { name: '提交建议' })).toBeEnabled()
  cleanup()
  mount(true, 8, true)
  expect(screen.getByLabelText('你的原始建议')).toHaveValue('希望历史更好用')
  expect(screen.getByLabelText('需求标题')).toHaveValue('历史快速定位')
})

it('shows one compact list card and recovers from loading failure', async () => {
  vi.mocked(listSuggestions).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ items: [saved], total: 1 })
  mount(false)
  fireEvent.click(await screen.findByRole('button', { name: '读取失败，重试' }))
  await screen.findByRole('button', { name: draft.title })
  expect(screen.getAllByLabelText('业务咨询需求建议卡片')).toHaveLength(1)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('prevents closing and duplicate generation while the request is running', async () => {
  let resolve!: (value: SuggestionDraft) => void
  vi.mocked(normalizeSuggestion).mockReturnValueOnce(new Promise(done => { resolve = done }))
  const close = mount()
  fireEvent.change(screen.getByLabelText('你的原始建议'), { target: { value: '手机希望可以搜索' } })
  fireEvent.click(screen.getByRole('button', { name: '整理成需求描述' }))
  expect(screen.getByRole('button', { name: '关闭需求建议' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '整理成需求描述' }))
  expect(normalizeSuggestion).toHaveBeenCalledTimes(1)
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(close).not.toHaveBeenCalled()
  resolve(draft)
  await waitFor(() => expect(screen.getByLabelText('需求标题')).toHaveValue(draft.title))
})
