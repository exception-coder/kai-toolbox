import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageList } from './MessageList'
import { setHideToolCalls } from '../lib/toolVisibilityPref'

const scrolling = vi.hoisted(() => ({ scrollToIndex: vi.fn(), scrollTo: vi.fn() }))
afterEach(() => { cleanup(); setHideToolCalls(false); vi.useRealTimers(); vi.clearAllMocks() })

vi.mock('react-virtuoso', async () => {
  const { forwardRef, useImperativeHandle } = await import('react')
  return {
    Virtuoso: forwardRef(function VirtuosoMock(props: {
      components: { Header: ComponentType<{ context?: unknown }> }
      context: unknown
      startReached?: () => void
      atBottomStateChange: (value: boolean) => void
      scrollerRef: (element: HTMLElement) => void
      totalListHeightChanged: () => void
    }, ref) {
      useImperativeHandle(ref, () => ({ scrollToIndex: scrolling.scrollToIndex }))
      const Header = props.components.Header
      return <div ref={element => {
        if (!element) return
        Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 2400 })
        element.scrollTo = scrolling.scrollTo
        props.scrollerRef(element)
      }}><Header context={props.context} /><span data-testid="automatic-history-load">{String(Boolean(props.startReached))}</span>
        <button onClick={props.totalListHeightChanged}>模拟高度校正</button>
        <button onClick={() => props.atBottomStateChange(false)}>模拟离底</button>
        <button onClick={() => props.atBottomStateChange(true)}>模拟贴底</button></div>
    }),
  }
})

describe('MessageList 历史分页入口', () => {
  it('最近一页全为隐藏工具时显示恢复入口', () => {
    setHideToolCalls(true)
    render(<MessageList items={[{ kind: 'tool', id: 'h1', toolName: 'read', input: {} }]} running={false} />)
    expect(screen.getByRole('status')).toHaveTextContent('工具调用当前已隐藏')
    fireEvent.click(screen.getByRole('button', { name: '显示工具记录' }))
    expect(screen.queryByText('最近记录已加载，工具调用当前已隐藏。')).not.toBeInTheDocument()
  })

  it('空首屏明确显示正在加载最近消息', () => {
    render(<MessageList items={[]} running={false} loadingEarlier onLoadEarlier={() => {}} />)
    expect(screen.getByRole('button', { name: '正在加载最近消息…' })).toBeDisabled()
  })
  it('按真实滚动高度补齐跳转，用户上滑后停止校正', () => {
    vi.useFakeTimers()
    render(<MessageList items={[{ kind: 'assistant', id: 'long', text: '长回复' }]} running={false} />)
    fireEvent.click(screen.getByRole('button', { name: '模拟离底' }))
    fireEvent.click(screen.getByRole('button', { name: /跳到最新/ }))
    vi.advanceTimersByTime(20)
    expect(scrolling.scrollTo).toHaveBeenLastCalledWith({ top: 2400, behavior: 'instant' })
    fireEvent.click(screen.getByRole('button', { name: '模拟高度校正' }))
    vi.advanceTimersByTime(20)
    expect(scrolling.scrollTo).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(3000)
    fireEvent.click(screen.getByRole('button', { name: '模拟高度校正' }))
    vi.advanceTimersByTime(20)
    expect(scrolling.scrollTo).toHaveBeenCalledTimes(3)
    fireEvent.wheel(screen.getByRole('button', { name: '模拟离底' }))
    fireEvent.click(screen.getByRole('button', { name: '模拟高度校正' }))
    vi.advanceTimersByTime(20)
    expect(scrolling.scrollTo).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })
  it('跳到当前末项底部，实际贴底前保留恢复入口', () => {
    const view = render(<MessageList items={[{ kind: 'assistant', id: 'long', text: '长回复'.repeat(1000) }]} running={false} />)
    fireEvent.click(screen.getByRole('button', { name: '模拟离底' }))
    fireEvent.click(screen.getByRole('button', { name: /跳到最新/ }))
    expect(scrolling.scrollToIndex).toHaveBeenLastCalledWith({ index: 'LAST', align: 'end', behavior: 'auto' })
    expect(screen.getByRole('button', { name: /跳到最新/ })).toBeInTheDocument()
    view.rerender(<MessageList items={[{ kind: 'assistant', id: 'long', text: '持续生成'.repeat(1100) }]} running />)
    expect(screen.getByRole('button', { name: /跳到最新/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '模拟贴底' }))
    expect(screen.queryByRole('button', { name: /跳到最新/ })).not.toBeInTheDocument()
  })
  it('不只依赖触顶事件，始终提供可点击的加载更早入口', () => {
    const onLoadEarlier = vi.fn()
    render(
      <MessageList
        items={[{ kind: 'user', id: 'message-1', text: '当前消息' }]}
        running={false}
        onLoadEarlier={onLoadEarlier}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '加载更早' }))
    expect(onLoadEarlier).toHaveBeenCalledOnce()
    expect(screen.getByTestId('automatic-history-load')).toHaveTextContent('false')
  })

  it('跳转等待慢速最新页，缓存换成同条数新页后才定位并校正底部', async () => {
    vi.useFakeTimers()
    let finish!: (loaded: boolean) => void
    const onLoadLatest = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve }))
    const oldItems = [{ kind: 'assistant' as const, id: 'h-old', text: '缓存末条' }]
    const newItems = [{ kind: 'assistant' as const, id: 'h-new', text: '实际最新末条' }]
    const view = render(<MessageList sessionKey="a" items={oldItems} running={false} onLoadLatest={onLoadLatest} />)
    fireEvent.wheel(screen.getByRole('button', { name: '模拟离底' }))
    fireEvent.click(screen.getByRole('button', { name: '模拟离底' }))
    scrolling.scrollToIndex.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /跳到最新/ }))
    expect(onLoadLatest).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '正在获取最新消息…' })).toBeDisabled()
    vi.advanceTimersByTime(3000)
    view.rerender(<MessageList sessionKey="a" items={newItems} running={false} onLoadLatest={onLoadLatest} loadingEarlier />)
    await act(async () => finish(true))
    expect(scrolling.scrollToIndex).not.toHaveBeenCalled()
    view.rerender(<MessageList sessionKey="a" items={newItems} running={false} onLoadLatest={onLoadLatest} />)
    expect(scrolling.scrollToIndex).toHaveBeenLastCalledWith({ index: 'LAST', align: 'end', behavior: 'auto' })
    act(() => vi.advanceTimersByTime(20))
    expect(scrolling.scrollTo).toHaveBeenLastCalledWith({ top: 2400, behavior: 'instant' })
  })

  it.each(['上滑', '切换会话'])('等待最新页时%s取消旧定位意图', async action => {
    let finish!: (loaded: boolean) => void
    const onLoadLatest = () => new Promise<boolean>(resolve => { finish = resolve })
    const items = [{ kind: 'assistant' as const, id: 'h-old', text: '旧会话' }]
    const view = render(<MessageList sessionKey="a" items={items} running={false} onLoadLatest={onLoadLatest} />)
    fireEvent.click(screen.getByRole('button', { name: '模拟离底' }))
    fireEvent.click(screen.getByRole('button', { name: /跳到最新/ }))
    if (action === '上滑') fireEvent.wheel(screen.getByRole('button', { name: '模拟离底' }))
    else view.rerender(<MessageList sessionKey="b" items={[]} running={false} onLoadLatest={onLoadLatest} />)
    scrolling.scrollToIndex.mockClear()
    await act(async () => finish(true))
    expect(scrolling.scrollToIndex).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '正在获取最新消息…' })).not.toBeInTheDocument()
  })

  it('会话尚未 ready 时点击跳转，等首次权威页而非提前定位缓存', async () => {
    const onLoadLatest = vi.fn().mockResolvedValue(null)
    const cached = [{ kind: 'assistant' as const, id: 'h-old', text: '缓存末条' }]
    const view = render(<MessageList sessionKey="a" items={cached} running={false} onLoadLatest={onLoadLatest} loadingEarlier />)
    fireEvent.click(screen.getByRole('button', { name: '模拟离底' }))
    scrolling.scrollToIndex.mockClear()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /跳到最新/ })))
    expect(screen.getByRole('button', { name: '正在获取最新消息…' })).toBeDisabled()
    expect(scrolling.scrollToIndex).not.toHaveBeenCalled()
    view.rerender(<MessageList sessionKey="a" items={[{ kind: 'assistant', id: 'h-new', text: '实际末条' }]} running={false} onLoadLatest={onLoadLatest} />)
    expect(onLoadLatest).toHaveBeenCalledOnce()
    expect(scrolling.scrollToIndex).toHaveBeenLastCalledWith({ index: 'LAST', align: 'end', behavior: 'auto' })
  })

  it('最新页失败保留消息与原位重试，不把缓存末尾当作成功', async () => {
    let finish!: (loaded: boolean) => void
    const onLoadLatest = vi.fn().mockImplementationOnce(() => new Promise<boolean>(resolve => { finish = resolve })).mockResolvedValueOnce(true)
    const items = [{ kind: 'assistant' as const, id: 'h-old', text: '缓存' }]
    const view = render(<MessageList sessionKey="a" items={items} running={false} onLoadLatest={onLoadLatest} />)
    fireEvent.click(screen.getByRole('button', { name: '模拟离底' }))
    scrolling.scrollToIndex.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /跳到最新/ }))
    view.rerender(<MessageList sessionKey="a" items={items} running={false} onLoadLatest={onLoadLatest} loadingEarlier />)
    await act(async () => finish(false))
    view.rerender(<MessageList sessionKey="a" items={items} running={false} onLoadLatest={onLoadLatest} />)
    expect(scrolling.scrollToIndex).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '获取最新消息失败 · 跳到最新重试' })))
    expect(onLoadLatest).toHaveBeenCalledTimes(2)
    expect(scrolling.scrollToIndex).toHaveBeenLastCalledWith({ index: 'LAST', align: 'end', behavior: 'auto' })
  })

  it('分页失败后原位显示可操作的重试提示', () => {
    const onLoadEarlier = vi.fn()
    render(
      <MessageList
        items={[{ kind: 'user', id: 'message-1', text: '当前消息' }]}
        running={false}
        onLoadEarlier={onLoadEarlier}
        loadEarlierError="加载更早消息超时，请点击重试"
      />,
    )

    const retry = screen.getByRole('button', { name: '加载更早消息超时，请点击重试' })
    fireEvent.click(retry)
    expect(onLoadEarlier).toHaveBeenCalledOnce()
  })
})
