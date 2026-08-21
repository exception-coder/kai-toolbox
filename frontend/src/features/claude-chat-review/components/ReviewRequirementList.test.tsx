import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReviewRequirementList } from './ReviewRequirementList'

vi.mock('@/features/claude-chat/public-api', () => ({
  Markdown: ({ text }: { text: string }) => <div>{text}</div>,
}))

const item = {
  id: 'requirement-1',
  sourceMessageId: 'assistant-content-v1:test',
  title: '支持审批驳回',
  content: '## 需求说明\n审批人可以驳回申请。',
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
  sources: [{
    sourceMessageId: 'assistant-content-v1:test',
    sourceText: '审批需要支持驳回',
    analysisText: 'AI 已整理审批驳回的业务规则。',
    operation: 'CREATE' as const,
    createdAt: 1,
  }],
}

describe('评审需求清单', () => {
  it('允许评审员修改 AI 整理的标题和说明', async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    render(<ReviewRequirementList open onOpenChange={vi.fn()} items={[item]} loading={false}
      syncing={false} error={null} busyIds={new Set()} onReload={vi.fn()}
      onSave={onSave} onDelete={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '修改需求：支持审批驳回' }))
    fireEvent.change(screen.getByRole('textbox', { name: '需求标题' }), { target: { value: '支持审批驳回并重新提交' } })
    fireEvent.change(screen.getByRole('textbox', { name: '需求说明' }), { target: { value: '修订后的业务说明' } })
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }))

    expect(onSave).toHaveBeenCalledWith(item, '支持审批驳回并重新提交', '修订后的业务说明')
  })

  it('删除使用二次确认且不影响原聊天', () => {
    const onDelete = vi.fn().mockResolvedValue(true)
    render(<ReviewRequirementList open onOpenChange={vi.fn()} items={[item]} loading={false}
      syncing={false} error={null} busyIds={new Set()} onReload={vi.fn()}
      onSave={vi.fn()} onDelete={onDelete} />)

    fireEvent.click(screen.getByRole('button', { name: '删除需求：支持审批驳回' }))
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '确认删除需求：支持审批驳回' }))
    expect(onDelete).toHaveBeenCalledWith(item)
  })

  it('正式清单默认只展示归纳结果并可展开来源证据', () => {
    render(<ReviewRequirementList open onOpenChange={vi.fn()} items={[item]} loading={false}
      syncing={false} error={null} busyIds={new Set()} onReload={vi.fn()}
      onSave={vi.fn()} onDelete={vi.fn()} />)

    expect(screen.queryByText('审批需要支持驳回')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /需求来源 1 条/ }))
    expect(screen.getByText('审批需要支持驳回')).toBeInTheDocument()
    expect(screen.getByText('查看关联 AI 分析')).toBeInTheDocument()
  })
})
