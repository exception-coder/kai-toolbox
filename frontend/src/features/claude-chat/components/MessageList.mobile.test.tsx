import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import type { ChatItem } from '../types'
import { MessageList } from './MessageList'
import { setHideToolCalls } from '../lib/toolVisibilityPref'

vi.mock('react-virtuoso', async () => {
  const { forwardRef, useImperativeHandle } = await import('react')
  return { Virtuoso: forwardRef(function List(props: { data: ChatItem[]; itemContent: (index: number, item: ChatItem) => React.ReactNode }, ref) {
    useImperativeHandle(ref, () => ({ scrollToIndex: vi.fn(), scrollTo: vi.fn() }))
    return <div>{props.data.map((item, index) => <div key={item.id}>{props.itemContent(index, item)}</div>)}</div>
  }) }
})
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })
const items: ChatItem[] = [
  { kind: 'assistant', id: 'answer', text: '本轮调整已完成。', forkAnchor: 'turn-old' },
  { kind: 'result', id: 'result', stopReason: 'end_turn', latencyMs: 371400, usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 2400000 } },
  { kind: 'activity', id: 'command', activityType: 'command', title: '执行命令中', status: 'running' },
  { kind: 'activity', id: 'files', activityType: 'diff', title: '文件修改中', status: 'running' },
  { kind: 'activity', id: 'warning', activityType: 'tool', title: '需要处理连接问题', status: 'running', severity: 'warning' },
  { kind: 'error', id: 'error', code: 'TEST', message: '保存失败，请重试' },
  { kind: 'tool', id: 'tool-error', toolName: '读取文件失败', input: {}, output: '权限不足', isError: true },
]
function mount(mobile: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  setHideToolCalls(true)
  const fork = vi.fn()
  render(<MemoryRouter><MessageList items={items} running mobileWorkspace showRunningFooter={false} onFork={fork} /></MemoryRouter>)
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
  const token = screen.getByText(/Token 2.4百万/)
  expect(token).not.toBeVisible()
  fireEvent.click(screen.getByText('详情 ›'))
  expect(token).toBeVisible()
  expect(screen.getByRole('button', { name: '复制本轮' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '从这条回答处分叉对话' }))
  expect(fork).toHaveBeenCalledExactlyOnceWith('turn-old')
  expect(screen.queryByRole('button', { name: '转为卡片' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '更多回复操作' }))
  expect(screen.getByRole('button', { name: '转为卡片' })).toBeInTheDocument()
})

it('retains desktop activity cards and the detailed turn controls', () => {
  mount(false)
  expect(screen.getByText('执行命令中')).toBeInTheDocument()
  expect(screen.getByText('文件修改中')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '转为卡片' })).toBeInTheDocument()
  expect(screen.queryByText('此轮已完成')).not.toBeInTheDocument()
})
