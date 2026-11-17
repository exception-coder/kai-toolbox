import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { PlanReviewDialog } from './PlanReviewDialog'
import * as api from '../lib/planReviewApi'

vi.mock('../lib/planReviewApi', async importOriginal => ({ ...await importOriginal<typeof api>(),
  listPlanReviews: vi.fn(), getPlanReview: vi.fn(), createPlanReview: vi.fn(), changePlanReview: vi.fn() }))
vi.mock('./Markdown', () => ({ Markdown: ({ text }: { text: string }) => <p>{text}</p> }))
const batch: api.PlanReview = { id: 'batch', sessionId: 'session', sourceMessageId: 'message', material: '冻结的方案正文', focus: '权限边界', createdAt: 1,
  tasks: [{ engine: 'codex', attemptId: 'a', status: 'SUCCEEDED', result: '建议补充访问校验', error: null, model: 'actual-model' },
    { engine: 'claude', attemptId: 'b', status: 'FAILED', result: null, error: '认证失败', model: null }] }
beforeEach(() => {
  localStorage.clear()
  vi.mocked(api.listPlanReviews).mockResolvedValue([{ id: 'batch', sourceMessageId: 'message', createdAt: 1, preview: '冻结的方案正文', activeCount: 0, total: 2 }])
  vi.mocked(api.getPlanReview).mockResolvedValue(batch)
  vi.mocked(api.createPlanReview).mockResolvedValue(batch)
  vi.mocked(api.changePlanReview).mockResolvedValue(batch)
})
afterEach(() => { cleanup(); vi.resetAllMocks() })
function mount(initial = true, engines: typeof api.REVIEW_ENGINES[number][] = ['codex', 'claude']) {
  const onQuote = vi.fn(), onClose = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(<QueryClientProvider client={client}><PlanReviewDialog sessionId="session" initial={initial ? { id: 'message', text: '引用原文' } : undefined}
    engines={engines} onClose={onClose} onQuote={onQuote} returnFocus={vi.fn()} /></QueryClientProvider>)
  return { onQuote, onClose, client }
}

it('shows the complete engine catalog with explicit availability and review restrictions', () => {
  mount()
  expect(screen.getAllByRole('checkbox')).toHaveLength(11)
  expect(screen.getByRole('checkbox', { name: /DeepSeek Harness/ })).toBeDisabled()
  expect(screen.getByRole('checkbox', { name: /ZCode/ })).toBeDisabled()
  expect(screen.getByRole('checkbox', { name: /Antigravity/ })).toBeDisabled()
  expect(screen.getByText('原生 CLI 尚未核验禁用全部工具的能力')).toBeTruthy()
})

it('submits all nine supported engines without the previous four-engine limit', async () => {
  mount(true, [...api.REVIEW_ENGINES])
  for (const checkbox of screen.getAllByRole('checkbox') as HTMLInputElement[]) {
    if (!checkbox.disabled && !checkbox.checked) fireEvent.click(checkbox)
  }
  fireEvent.click(screen.getByRole('button', { name: '开始评审（9 个引擎）' }))
  await waitFor(() => expect(api.createPlanReview).toHaveBeenCalledTimes(1))
  expect(vi.mocked(api.createPlanReview).mock.calls[0][1].engines).toHaveLength(9)
})

it('confirms material and selected engines before dispatch, duplicate clicks do not create another batch', async () => {
  mount()
  const content = screen.getByRole('region', { name: '评审内容' })
  content.scrollTop = 800
  fireEvent.change(screen.getByLabelText('引用的方案材料'), { target: { value: '确认后的方案' } })
  fireEvent.change(screen.getByLabelText('重点关注'), { target: { value: '权限边界' } })
  const button = screen.getByRole('button', { name: '开始评审（2 个引擎）' })
  fireEvent.click(button); fireEvent.click(button)
  await waitFor(() => expect(api.createPlanReview).toHaveBeenCalledTimes(1))
  expect(vi.mocked(api.createPlanReview).mock.calls[0][1]).toMatchObject({ material: '确认后的方案', focus: '权限边界', engines: ['claude', 'codex'] })
  expect(await screen.findByText('建议补充访问校验')).toBeTruthy()
  expect(await screen.findByRole('heading', { name: '评审进度' })).toBeTruthy()
  expect(await screen.findByText('1 / 2 项成功 · 0 项进行中 · 1 项未完成')).toBeTruthy()
  expect(content.scrollTop).toBe(0)
})

it('keeps rejection and history navigation visible outside the long mobile form without losing material', async () => {
  vi.mocked(api.createPlanReview).mockRejectedValue(new ApiError(400, null, '请选择 1 至 4 个受支持的评审引擎。'))
  mount()
  const content = screen.getByRole('region', { name: '评审内容' })
  content.scrollTop = 800
  fireEvent.change(screen.getByLabelText('引用的方案材料'), { target: { value: '保留我的方案' } })
  fireEvent.click(screen.getByRole('button', { name: '开始评审（2 个引擎）' }))
  const error = await screen.findByRole('alert')
  expect(error.textContent).toContain('评审未启动')
  expect(error.textContent).toContain('当前服务尚未支持所选新增引擎')
  expect(content.contains(error)).toBe(false)
  expect(content.contains(screen.getByRole('button', { name: '开始评审（2 个引擎）' }))).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: '调整评审引擎' }))
  expect(screen.getByRole('group', { name: '选择评审引擎' })).toHaveFocus()
  const history = screen.getByRole('button', { name: /历史评审/ })
  expect(content.contains(history)).toBe(false)
  expect((screen.getByLabelText('引用的方案材料') as HTMLTextAreaElement).value).toBe('保留我的方案')
  expect(api.createPlanReview).toHaveBeenCalledTimes(1)
  fireEvent.click(history)
  expect(await screen.findByLabelText('选择评审记录')).toBeTruthy()
  expect(content.scrollTop).toBe(0)
})

it('does not claim a network interruption means no review started and offers history recovery', async () => {
  vi.mocked(api.createPlanReview).mockRejectedValue(new TypeError('Failed to fetch'))
  mount()
  fireEvent.click(screen.getByRole('button', { name: '开始评审（2 个引擎）' }))
  expect((await screen.findByRole('alert')).textContent).toContain('提交结果待确认')
  expect(screen.queryByText('评审未启动')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '查看历史确认结果' }))
  expect(await screen.findByLabelText('选择评审记录')).toBeTruthy()
  expect(api.createPlanReview).toHaveBeenCalledTimes(1)
})

it('history survives reopening, retries only failed engine and quotes into draft without executing', async () => {
  const { onQuote, onClose } = mount(false)
  await screen.findByRole('option', { name: /冻结的方案正文/ })
  fireEvent.change(screen.getByLabelText('选择评审记录'), { target: { value: 'batch' } })
  fireEvent.click(await screen.findByRole('button', { name: /重试 Claude/ }))
  await waitFor(() => expect(api.changePlanReview).toHaveBeenCalledWith('session', 'batch', 'claude', 'retry', expect.any(String)))
  fireEvent.click(await screen.findByRole('button', { name: /引用 Codex 建议到草稿/ }))
  await waitFor(() => expect(onQuote).toHaveBeenCalledTimes(1))
  expect(onQuote.mock.calls[0][0]).toContain('冻结的方案正文')
  expect(onQuote.mock.calls[0][0]).toContain('actual-model')
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(api.createPlanReview).not.toHaveBeenCalled()
})

it('failed result refresh hides cached suggestions until access is recovered', async () => {
  const { client } = mount(false)
  await screen.findByRole('option', { name: /冻结的方案正文/ })
  fireEvent.change(screen.getByLabelText('选择评审记录'), { target: { value: 'batch' } })
  await screen.findByText('建议补充访问校验')
  vi.mocked(api.getPlanReview).mockRejectedValue(new Error('403'))
  await client.invalidateQueries({ queryKey: ['plan-review', 'session', 'batch'] })
  await screen.findByText(/结果读取失败/)
  expect(screen.queryByText('建议补充访问校验')).toBeNull()
})

it('request identity is stable across retry and changes when confirmed material changes', () => {
  const input = { sourceMessageId: 'message', material: '方案', focus: '', engines: ['codex' as const] }
  const first = api.planReviewRequestId('session', input)
  expect(api.planReviewRequestId('session', input)).toEqual(first)
  expect(api.planReviewRequestId('session', { ...input, material: '新方案' })).not.toEqual(first)
  expect(localStorage.getItem('forge:plan-review-request:session')).not.toContain('新方案')
})

it('keeps edited quote when closing until the user explicitly discards it', async () => {
  const { onClose } = mount()
  fireEvent.change(screen.getByLabelText('引用的方案材料'), { target: { value: '尚未提交的修改' } })
  fireEvent.click(screen.getByRole('button', { name: '关闭方案评审' }))
  expect(onClose).not.toHaveBeenCalled()
  fireEvent.click(await screen.findByRole('button', { name: '继续编辑' }))
  expect((screen.getByLabelText('引用的方案材料') as HTMLTextAreaElement).value).toBe('尚未提交的修改')
  fireEvent.click(screen.getByRole('button', { name: '关闭方案评审' }))
  fireEvent.click(await screen.findByRole('button', { name: '放弃编辑并关闭' }))
  expect(onClose).toHaveBeenCalledTimes(1)
})
