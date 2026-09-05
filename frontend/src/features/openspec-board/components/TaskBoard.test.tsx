import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskBoard } from './TaskBoard'
import type { OpenSpecTask } from '../types'

const tasks: OpenSpecTask[] = [
  { id: '1', outlineId: '1.1', description: 'Parse OpenSpec JSON', section: '1', state: 'TODO', runtime: null },
  { id: '2', outlineId: '2.1', description: 'Verify runtime state', section: '2', state: 'IN_REVIEW', runtime: null },
  { id: '3', outlineId: '3.1', description: 'Resolve blocker', section: '3', state: 'BLOCKED', runtime: null },
  { id: '4', outlineId: '4.1', description: 'Publish board', section: '4', state: 'DONE', runtime: null },
]

afterEach(cleanup)

describe('TaskBoard', () => {
  it('groups every supported state and selects a task', () => {
    const onTaskSelect = vi.fn()
    render(<TaskBoard tasks={tasks} query="" state="ALL" selectedTaskId={null}
      onQueryChange={vi.fn()} onStateChange={vi.fn()} onTaskSelect={onTaskSelect} />)

    expect(screen.getAllByText('待执行').length).toBeGreaterThan(0)
    expect(screen.getAllByText('待验证').length).toBeGreaterThan(0)
    expect(screen.getAllByText('阻塞').length).toBeGreaterThan(0)
    expect(screen.getAllByText('已完成').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByText('Resolve blocker')[0])
    expect(onTaskSelect).toHaveBeenCalledWith('3')
  })

  it('exposes narrow-screen state filtering and search input', () => {
    const onStateChange = vi.fn()
    const onQueryChange = vi.fn()
    const view = render(<TaskBoard tasks={tasks} query="runtime" state="IN_REVIEW" selectedTaskId={null}
      onQueryChange={onQueryChange} onStateChange={onStateChange} onTaskSelect={vi.fn()} />)

    fireEvent.change(view.getByLabelText('任务状态'), { target: { value: 'BLOCKED' } })
    fireEvent.change(view.getByPlaceholderText('搜索任务编号或内容'), { target: { value: 'board' } })
    expect(onStateChange).toHaveBeenCalledWith('BLOCKED')
    expect(onQueryChange).toHaveBeenCalledWith('board')
  })
})
