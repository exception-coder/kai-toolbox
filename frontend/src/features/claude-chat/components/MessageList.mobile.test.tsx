import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import type { ChatItem } from '../types'
import { MessageList } from './MessageList'
import { copyTextToClipboard } from '../lib/clipboard'
import { setHideToolCalls } from '../lib/toolVisibilityPref'

vi.mock('../lib/clipboard', () => ({ copyTextToClipboard: vi.fn(async () => {}) }))

vi.mock('react-virtuoso', async () => {
  const { forwardRef, useImperativeHandle } = await import('react')
  return { Virtuoso: forwardRef(function List(props: { data: ChatItem[]; itemContent: (index: number, item: ChatItem) => React.ReactNode }, ref) {
    useImperativeHandle(ref, () => ({ scrollToIndex: vi.fn(), scrollTo: vi.fn() }))
    return <div>{props.data.map((item, index) => <div key={item.id}>{props.itemContent(index, item)}</div>)}</div>
  }) }
})
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.mocked(copyTextToClipboard).mockReset() })
const items: ChatItem[] = [
  { kind: 'assistant', id: 'answer', text: '本轮调整已完成。', forkAnchor: 'turn-old' },
  { kind: 'result', id: 'result', stopReason: 'end_turn', latencyMs: 371400, usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 2400000 } },
  { kind: 'activity', id: 'command', activityType: 'command', title: '执行命令中', status: 'running' },
  { kind: 'activity', id: 'files', activityType: 'diff', title: '文件修改中', status: 'running' },
  { kind: 'activity', id: 'warning', activityType: 'tool', title: '需要处理连接问题', status: 'running', severity: 'warning' },
  { kind: 'error', id: 'error', code: 'TEST', message: '保存失败，请重试' },
  { kind: 'tool', id: 'tool-error', toolName: '读取文件失败', input: {}, output: '权限不足', isError: true },
]
function mount(mobile: boolean, workspace = true, data = items, running = true, executionInDock = false) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  setHideToolCalls(true)
  const fork = vi.fn()
  render(<MemoryRouter><MessageList items={data} running={running} mobileWorkspace={workspace} executionInDock={executionInDock} showRunningFooter={false} onFork={fork} /></MemoryRouter>)
  return fork
}

it('consolidates routine mobile execution but preserves warnings, ended-turn details and message actions', () => {
  const fork = mount(true)
  expect(screen.queryByText('执行命令中')).not.toBeInTheDocument()
  expect(screen.queryByText('文件修改中')).not.toBeInTheDocument()
  expect(screen.getByText('需要处理连接问题')).toBeInTheDocument()
  expect(screen.getByText(/保存失败，请重试/)).toBeInTheDocument()
  expect(screen.getByText('读取文件失败')).toBeInTheDocument()
  expect(screen.getByText('此轮已完成')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '复制回复' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '从这条回答处分叉对话' })).not.toBeInTheDocument()
  const token = screen.getByText(/Token 2.4百万/)
  expect(token).not.toBeVisible()
  fireEvent.click(screen.getByText('详情 ›'))
  expect(token).toBeVisible()
  expect(screen.getByRole('button', { name: '复制本轮' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '更多回复操作' }))
  fireEvent.click(screen.getByRole('button', { name: '从这条回答处分叉对话' }))
  expect(fork).toHaveBeenCalledExactlyOnceWith('turn-old')
  expect(screen.queryByRole('button', { name: '转为卡片' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '更多回复操作' }))
  expect(screen.getByRole('button', { name: '转为卡片' })).toBeInTheDocument()
})

it('consolidates desktop workspace execution and turn metrics while preserving message actions', () => {
  mount(false)
  expect(screen.queryByText('执行命令中')).not.toBeInTheDocument()
  expect(screen.queryByText('文件修改中')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '转为卡片' })).toBeInTheDocument()
  expect(screen.getByText('此轮已完成')).toBeInTheDocument()
  expect(screen.getByText(/Token 2.4百万/)).not.toBeVisible()
})

it('preserves activity cards in other embedded desktop views', () => {
  mount(false, false)
  expect(screen.getByText('执行命令中')).toBeInTheDocument()
  expect(screen.getByText('文件修改中')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '转为卡片' })).toBeInTheDocument()
  expect(screen.queryByText('此轮已完成')).not.toBeInTheDocument()
})

const longReply = '# 修复结果\n\n已完成界面调整，完整证据可展开查看。\n\n## 修改与验证\n\n' + '保留工具链路、队列及完整原文，不把执行完成当作业务成功。\n\n'.repeat(36) + '[查看源文件](/D:/project/result.ts)\n\n```java\nreturn result;\n```'

it('shows the original introduction on mobile and discloses complete headings, code and links without losing fork actions', () => {
  const fork = mount(true, true, [{ kind: 'assistant', id: 'long', text: longReply, forkAnchor: 'anchor' }], false)
  expect(screen.getByText('已完成界面调整，完整证据可展开查看。')).toBeVisible()
  expect(screen.queryByText('修改与验证')).not.toBeInTheDocument()
  const disclosure = screen.getByRole('button', { name: '查看回复详情' })
  expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(disclosure)
  expect(screen.getByRole('heading', { name: '修改与验证' })).toBeVisible()
  expect(screen.getByText('return result;')).toBeVisible()
  expect(screen.getByRole('link', { name: '查看源文件' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '更多回复操作' }))
  fireEvent.click(screen.getByRole('button', { name: '从这条回答处分叉对话' }))
  expect(fork).toHaveBeenCalledExactlyOnceWith('anchor')
  fireEvent.click(screen.getByRole('button', { name: '收起回复详情' }))
  expect(screen.queryByText('修改与验证')).not.toBeInTheDocument()
})

it('keeps the current streaming reply complete but folds a long completed reply from an earlier turn', () => {
  mount(true, true, [
    { kind: 'assistant', id: 'previous', text: longReply },
    { kind: 'result', id: 'completed', stopReason: 'end_turn' },
    { kind: 'user', id: 'next', text: '继续核对' },
    { kind: 'assistant', id: 'stream', text: longReply },
  ])
  expect(screen.getAllByRole('button', { name: '查看回复详情' })).toHaveLength(1)
  expect(screen.getAllByRole('heading', { name: '修改与验证' })).toHaveLength(1)
})

it('preserves complete desktop replies rather than applying the mobile summary layout', () => {
  mount(false, true, [{ kind: 'assistant', id: 'long', text: longReply }], false)
  expect(screen.getByRole('heading', { name: '修改与验证' })).toBeVisible()
  expect(screen.queryByRole('button', { name: '查看回复详情' })).not.toBeInTheDocument()
})

it('keeps short explicit changes and verification in the overview while folding the detailed process', () => {
  const text = '界面调整已完成。\n\n## 关键变化\n\n正文使用全宽。\n\n## 验证结果\n\n定向验证通过。\n\n## 详细过程\n\n' + '具体执行记录与证据。\n\n'.repeat(100)
  mount(true, true, [{ kind: 'assistant', id: 'overview', text }], false)
  expect(screen.getByRole('heading', { name: '关键变化' })).toBeVisible()
  expect(screen.getByText('定向验证通过。')).toBeVisible()
  expect(screen.queryByRole('heading', { name: '详细过程' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '查看回复详情' }))
  expect(screen.getByRole('heading', { name: '详细过程' })).toBeVisible()
})

it('places technical failures in the mounted dock while retaining actionable session errors in the conversation', () => {
  mount(true, true, items, true, true)
  expect(screen.queryByText('读取文件失败')).not.toBeInTheDocument()
  expect(screen.queryByText('需要处理连接问题')).not.toBeInTheDocument()
  expect(screen.getByText(/保存失败，请重试/)).toBeVisible()
  expect(screen.getByText('此轮已完成')).toBeVisible() // 上一轮的历史标记不会冒充当前轮。
})

it('honors an explicit tool display preference even when the mobile dock is mounted', () => {
  mount(true, true, items, true, true)
  act(() => setHideToolCalls(false))
  expect(screen.getByText('读取文件失败')).toBeVisible()
  expect(screen.getByText('需要处理连接问题')).toBeVisible()
})

it('moves only the current completed result into the dock and retains earlier round details', () => {
  mount(true, true, [
    { kind: 'assistant', id: 'old-answer', text: '历史结果' },
    { kind: 'result', id: 'old-result', stopReason: 'end_turn' },
    { kind: 'user', id: 'current-user', text: '新的需求' },
    { kind: 'assistant', id: 'current-answer', text: '本次结果' },
    { kind: 'result', id: 'current-result', stopReason: 'end_turn' },
  ], false, true)
  expect(screen.getAllByText('此轮已完成')).toHaveLength(1)
  expect(screen.getByText('本次结果')).toBeVisible()
})

it('surfaces verification after file details without rewriting the original evidence', () => {
  const text = '已完成布局调整。\n\n**主要变化：**\n\n- 顶部保持单行。\n\n**修改文件：**\n\n'
    + '- frontend/src/components/long-path-example.tsx\n'.repeat(12)
    + '\n**验证：**\n\n- typecheck 通过\n- 未执行真机验收\n\n## 风险\n\n- 外部图片可能无法加载。\n'
  mount(true, true, [{ kind: 'assistant', id: 'structured', text }], false)
  expect(screen.getByText('typecheck 通过')).toBeVisible()
  expect(screen.getByText('未执行真机验收')).toBeVisible()
  expect(screen.getByText('外部图片可能无法加载。')).toBeVisible()
  expect(screen.queryByText('修改文件：')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '查看回复详情' }))
  expect(screen.getByText('修改文件：')).toBeVisible()
  expect(screen.getAllByText('frontend/src/components/long-path-example.tsx')).toHaveLength(12)
})

it('copies the complete folded reply from more, surfaces failures and permits retry without changing content', async () => {
  vi.mocked(copyTextToClipboard).mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce()
  mount(true, true, [{ kind: 'assistant', id: 'copy', text: longReply }], false)
  const trigger = screen.getByRole('button', { name: '更多回复操作' })
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: '复制回复' }))
  await screen.findByText('复制失败，重试')
  fireEvent.click(screen.getByRole('button', { name: '复制回复' }))
  await screen.findByText('已复制')
  expect(copyTextToClipboard).toHaveBeenLastCalledWith(longReply)
  fireEvent.keyDown(screen.getByLabelText('回复操作'), { key: 'Escape' })
  await waitFor(() => expect(trigger).toHaveFocus())
})

it('retains shared reference definitions and code blocks when layering an answer', () => {
  const text = '当前验证尚未完成。\n\n## 关键变化\n\n[源文件][source]\n\n## 验证结果\n\n没有执行部署。\n\n[source]: https://example.com/source\n'
  mount(true, true, [{ kind: 'assistant', id: 'references', text }], false)
  expect(screen.getByRole('link', { name: '源文件' })).toHaveAttribute('href', 'https://example.com/source')
  expect(screen.getByText('没有执行部署。')).toBeVisible()
})
