import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VibeCodingGuide } from './VibeCodingGuide'
import { GUIDE_CHAPTERS } from './guideContent'

const props = () => ({ open: true, onOpenChange: vi.fn(), onLocate: vi.fn(), onRestore: vi.fn(), hasSession: true, returnFocus: { current: null } })
beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Vibe Coding 功能导览', () => {
  it('自动展开每步目标，无需点击定位，退出恢复工作区', () => {
    const options = props()
    render(<VibeCodingGuide {...options} />)
    expect(screen.getByRole('heading', { name: '新建与工作目录' })).toBeInTheDocument()
    expect(options.onLocate).toHaveBeenCalledExactlyOnceWith('start')
    expect(screen.queryByRole('button', { name: '定位入口' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByRole('heading', { name: '项目分组与搜索' })).toBeInTheDocument()
    expect(options.onLocate).toHaveBeenLastCalledWith('sessions')
    fireEvent.click(screen.getByRole('button', { name: '上一步' }))
    expect(options.onLocate).toHaveBeenLastCalledWith('start')
    fireEvent.click(screen.getByRole('button', { name: '暂不查看' }))
    expect(options.onRestore).toHaveBeenCalled()
    expect(options.onOpenChange).toHaveBeenCalledWith(false)
  })
  it('完整指南搜索用途与入口，空结果可恢复', () => {
    render(<VibeCodingGuide {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: '完整功能指南' }))
    fireEvent.change(screen.getByLabelText('查找功能或入口'), { target: { value: 'SQL' } })
    expect(screen.getByText('待执行 SQL')).toBeInTheDocument()
    expect(screen.queryByText('新建与工作目录')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('查找功能或入口'), { target: { value: '不存在功能' } })
    expect(screen.getByRole('status')).toHaveTextContent('没有匹配功能')
  })
  it('首次提示可跳过，重新挂载不重复提示，仍可手动打开', () => {
    const first = render(<VibeCodingGuide {...props()} open={false} />)
    fireEvent.click(screen.getByRole('button', { name: '暂时跳过' }))
    first.unmount()
    render(<VibeCodingGuide {...props()} open={false} />)
    expect(screen.queryByRole('button', { name: '开始导览' })).not.toBeInTheDocument()
  })
  it('存储异常不阻断关闭，并说明刷新后的影响', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    render(<VibeCodingGuide {...props()} open={false} />)
    fireEvent.click(screen.getByRole('button', { name: '暂时跳过' }))
    expect(screen.queryByRole('button', { name: '暂时跳过' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('刷新后可能再次提示')
    spy.mockRestore()
  })
  it('未选择会话仍可继续阅读，并说明执行视图前置条件', () => {
    render(<VibeCodingGuide {...props()} hasSession={false} />)
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled()
    expect(screen.getByText(/先新建或选择会话/)).toBeInTheDocument()
  })
  it('六类功能都描述用途、使用时机和真实入口', () => {
    expect(GUIDE_CHAPTERS).toHaveLength(6)
    for (const chapter of GUIDE_CHAPTERS) for (const topic of chapter.topics) {
      expect(topic.purpose.length).toBeGreaterThan(0)
      expect(topic.when.length).toBeGreaterThan(0)
      expect(topic.path.length).toBeGreaterThan(0)
    }
  })
})
