import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ConsultSuggestions } from './ConsultSuggestions'
import { listSuggestions, normalizeSuggestion, submitSuggestion, type SuggestionDraft } from '../suggestionApi'
vi.mock('../suggestionApi', () => ({ listSuggestions: vi.fn(), normalizeSuggestion: vi.fn(), submitSuggestion: vi.fn() }))
const draft: SuggestionDraft = { title: '手机快速回到最新消息', problem: '长回答不容易定位', expected: '点击回到最新消息', acceptance: '' }
const saved = { ...draft, id: 'saved', original: '手机长回答不好找', createdAt: 1 }
let client: QueryClient
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  vi.mocked(listSuggestions).mockResolvedValue({ items: [], total: 0 })
  vi.mocked(normalizeSuggestion).mockResolvedValue(draft)
})
afterEach(() => { cleanup(); client.clear(); sessionStorage.clear(); vi.resetAllMocks() })
function mount(open = true, userId = 7, compact = false) {
  const close = vi.fn()
  render(<QueryClientProvider client={client}><ConsultSuggestions userId={userId} open={open} onOpenChange={close} compact={compact} /></QueryClientProvider>)
  return close
}

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
  await dialog.findByText(/已提交到业务咨询需求建议清单/)
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
