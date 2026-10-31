import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { ReviewRequirementList } from './ReviewRequirementList'

vi.mock('@/features/claude-chat/public-api', () => ({
  Markdown: ({ text }: { text: string }) => <div>{text}</div>, useMobileViewport: () => true,
  reviewTodoStatusLabel: {},
}))
afterEach(cleanup)
const item = { id: 'req', sourceMessageId: 'assistant-content-v1:test', title: '支持驳回',
  content: '## 类型\n需求\n\n## 问题\n不能驳回\n\n## 预期行为\n可以驳回\n\n## 验收标准\n驳回后可重新提交', revision: 1, confirmed: false, createdAt: 1, updatedAt: 1,
  sources: [{ sourceMessageId: 'source', sourceText: '审批需要驳回', analysisText: '建议增加驳回', operation: 'CREATE' as const, createdAt: 1 }] }
function props(): ComponentProps<typeof ReviewRequirementList> {
  return { token: 'token', open: true, onOpenChange: vi.fn(), onCloseFocus: vi.fn(), submitting: false, submitError: null, onSubmit: vi.fn().mockResolvedValue(true), onShowSource: vi.fn(),
    delivery: { targetProject: '项目 A', tasks: [], submissions: [] }, deliveryError: null, onRetryDelivery: vi.fn(),
    backlog: { items: [item], candidates: [], loading: false, busy: false, error: null, reload: vi.fn(), add: vi.fn(), save: vi.fn(), confirm: vi.fn(), remove: vi.fn(), merge: vi.fn() } }
}
it('submits only confirmed revisions after showing the target and keeps the list on failure', async () => {
  const input = props()
  input.backlog.items = [{ ...item, confirmed: true }, { ...item, id: 'pending', title: '未确认需求' }]
  input.onSubmit = vi.fn().mockResolvedValue(false)
  render(<ReviewRequirementList {...input} />)
  fireEvent.click(screen.getByRole('button', { name: '提交已确认需求（1）' }))
  expect(input.onSubmit).not.toHaveBeenCalled()
  expect(screen.getByText('目标项目：项目 A')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '确认提交开发' }))
  await waitFor(() => expect(input.onSubmit).toHaveBeenCalledExactlyOnceWith([{ ...item, confirmed: true }]))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '确认提交开发' })).toBeInTheDocument()
})
it('retains failed edits and the unfinished draft across closing the sheet', async () => {
  const input = props()
  input.backlog.save = vi.fn().mockResolvedValue(false)
  const view = render(<ReviewRequirementList {...input} />)
  fireEvent.click(screen.getByRole('button', { name: '编辑 / 合并' }))
  fireEvent.change(screen.getByRole('textbox', { name: '需求标题' }), { target: { value: '修订后标题' } })
  fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
  await waitFor(() => expect(input.backlog.save).toHaveBeenCalled())
  expect(screen.getByRole('textbox', { name: '需求标题' })).toHaveValue('修订后标题')
  view.rerender(<ReviewRequirementList {...input} open={false} />)
  view.rerender(<ReviewRequirementList {...input} />)
  expect(screen.getByRole('textbox', { name: '需求标题' })).toHaveValue('修订后标题')
})
it('confirms explicitly, exposes source evidence and requires a second removal action', () => {
  const input = props()
  render(<ReviewRequirementList {...input} />)
  fireEvent.click(screen.getByRole('button', { name: '确认需求' }))
  expect(input.backlog.confirm).toHaveBeenCalledWith(item, true)
  fireEvent.click(screen.getByText('查看需求与验收'))
  fireEvent.click(screen.getByText('来源依据'))
  fireEvent.click(screen.getByRole('button', { name: '查看原始消息与截图' }))
  expect(input.onShowSource).toHaveBeenCalledWith('source')
  fireEvent.click(screen.getByRole('button', { name: '移除' }))
  expect(input.backlog.remove).not.toHaveBeenCalled()
  input.backlog.remove = vi.fn().mockResolvedValue(true)
  fireEvent.click(screen.getByRole('button', { name: '确认移除' }))
  expect(input.backlog.remove).toHaveBeenCalledWith(item)
  expect(screen.queryByText('提交最新一条')).not.toBeInTheDocument()
})
