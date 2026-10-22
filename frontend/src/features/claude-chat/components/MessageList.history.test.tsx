import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageList } from './MessageList'
import { setHideToolCalls } from '../lib/toolVisibilityPref'

const scrolling = vi.hoisted(() => ({ scrollToIndex: vi.fn(), scrollToBottom: vi.fn(), scrollTo: vi.fn() }))
afterEach(() => { cleanup(); setHideToolCalls(false); vi.useRealTimers(); vi.clearAllMocks(); scrolling.scrollToBottom.mockReset(); vi.unstubAllGlobals() })

vi.mock('react-virtuoso', async () => {
  const { forwardRef, useImperativeHandle } = await import('react')
  return {
    Virtuoso: forwardRef(function VirtuosoMock(props: {
      components: { Header: ComponentType<{ context?: unknown }> }
      context: unknown
      startReached?: () => void
      atBottomStateChange: (value: boolean) => void
      atBottomThreshold: number
      scrollerRef: (element: HTMLElement) => void
      totalListHeightChanged: () => void
      firstItemIndex: number
    }, ref) {
      useImperativeHandle(ref, () => ({ scrollToIndex: scrolling.scrollToIndex, scrollTo: scrolling.scrollToBottom }))
      const Header = props.components.Header
      return <div data-testid="message-scroller" data-first-index={props.firstItemIndex} ref={element => {
        if (!element) return
        Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 2400 })
        Object.defineProperty(element, 'clientHeight', { configurable: true, value: 400 })
        element.scrollTo = scrolling.scrollTo
        props.scrollerRef(element)
      }}><Header context={props.context} /><span data-testid="automatic-history-load">{String(Boolean(props.startReached))}</span>
        <button onClick={props.totalListHeightChanged}>模拟高度校正</button>
        <button onClick={() => props.atBottomStateChange(4 <= props.atBottomThreshold)}>模拟浮窗末条边距</button>
        <button onClick={() => props.atBottomStateChange(false)}>模拟离底</button>
        <button onClick={() => props.atBottomStateChange(true)}>模拟贴底</button></div>
    }),
  }
})

describe('MessageList 历史分页入口', () => {
  it('长历史的末项索引估算失准时，显式跳转仍对齐实际滚动底部', () => {
    vi.useFakeTimers()
    render(<MessageList items={[{ kind: 'assistant', id: 'long', text: '含代码块的长回复' }]} running />)
    const scroller = screen.getByTestId('message-scroller')
    scroller.scrollTop = 500
    fireEvent.wheel(scroller)
    fireEvent.click(screen.getByRole('button', { name: '模拟离底' }))
    scrolling.scrollToBottom.mockImplementation(({ top }: { top: number }) => { scroller.scrollTop = top })
    fireEvent.click(screen.getByRole('button', { name: /跳到最新/ }))
    expect(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop).toBeLessThanOrEqual(8)
    // 实际故障：命令先到达底部，虚拟列表随后补偿回旧回复，总高度完全不变。
    scrolling.scrollToBottom.mockClear()
    scroller.scrollTop = 500
    fireEvent.scroll(scroller)
    fireEvent.scroll(scroller)
    act(() => vi.advanceTimersByTime(20))
    expect(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop).toBeLessThanOrEqual(8)
    expect(scrolling.scrollToBottom).toHaveBeenCalledTimes(1)
    fireEvent.scroll(scroller)
    act(() => vi.advanceTimersByTime(20))
    expect(scrolling.scrollToBottom).toHaveBeenCalledTimes(1)
    expect(scrolling.scrollTo).not.toHaveBeenCalled()
  })

  it('补偿校正等待下一帧时，用户回看立即撤销且不再拉回底部', () => {
    vi.useFakeTimers()
    const view = render(<MessageList sessionKey="first" items={[{ kind: 'assistant', id: 'long', text: '长回复' }]} running />)
    const scroller = screen.getByTestId('message-scroller')
    fireEvent.click(screen.getByRole('button', { name: '模拟离底' }))
    fireEvent.click(screen.getByRole('button', { name: /跳到最新/ }))
    scrolling.scrollToBottom.mockClear()
    fireEvent.scroll(scroller)
    fireEvent.wheel(scroller)
    act(() => vi.advanceTimersByTime(20))
    fireEvent.scroll(scroller)
    act(() => vi.advanceTimersByTime(20))
    expect(scrolling.scrollToBottom).not.toHaveBeenCalled()
    view.unmount()
    fireEvent.scroll(scroller)
    act(() => vi.advanceTimersByTime(20))
    expect(scrolling.scrollToBottom).not.toHaveBeenCalled()
  })

  it('已连接且正在回复时立即跳到实时末项，不用可能滞后的历史页覆盖输出', () => {
    vi.useFakeTimers()
    const onLoadLatest = vi.fn(() => new Promise<boolean>(() => {}))
    const items = [
      { kind: 'user' as const, id: 'question', text: '本轮提问' },
      { kind: 'assistant' as const, id: 'reply', text: '正在输出的最新回复' },
    ]
    const view = render(<MessageList items={items} running connState="ready" onLoadLatest={onLoadLatest} />)
    fireEvent.wheel(screen.getByTestId('message-scroller'))
    fireEvent.click(screen.getByRole('button', { name: '模拟离底' }))
    scrolling.scrollToBottom.mockClear()

    fireEvent.click(screen.getByRole('button', { name: /跳到最新/ }))

    expect(onLoadLatest).not.toHaveBeenCalled()
    expect(scrolling.scrollToBottom).toHaveBeenLastCalledWith({ top: 2000, behavior: 'auto' })
    expect(screen.queryByRole('button', { name: '正在获取最新消息…' })).not.toBeInTheDocument()
    scrolling.scrollToBottom.mockClear()
    view.rerender(<MessageList items={[items[0], { ...items[1], text: '同一回复继续增长' }]} running onLoadLatest={onLoadLatest} />)
    fireEvent.click(screen.getByRole('button', { name: '模拟高度校正' }))
    act(() => vi.advanceTimersByTime(20))
    expect(scrolling.scrollToBottom).toHaveBeenCalledTimes(1)

    fireEvent.wheel(screen.getByTestId('message-scroller'))
    view.rerender(<MessageList items={[...items, { kind: 'assistant', id: 'next', text: '后续回复' }]} running onLoadLatest={onLoadLatest} />)
    fireEvent.click(screen.getByRole('button', { name: '模拟高度校正' }))
    act(() => vi.advanceTimersByTime(20))
    expect(scrolling.scrollToBottom).toHaveBeenCalledTimes(1)
  })

  it('回复中连接尚未恢复时仍核对最近页，不把旧缓存当成实时输出', async () => {
    const onLoadLatest = vi.fn(async () => true)
    render(<MessageList items={[{ kind: 'user', id: 'question', text: '缓存提问' }]}
      running connState="connecting" onLoadLatest={onLoadLatest} />)
    fireEvent.wheel(screen.getByTestId('message-scroller'))
    fireEvent.click(screen.getByRole('button', { name: '模拟离底' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /跳到最新/ })))
    expect(onLoadLatest).toHaveBeenCalledOnce()
    expect(scrolling.scrollToBottom).toHaveBeenLastCalledWith({ top: 2000, behavior: 'auto' })
  })

  it('浮窗末条的四像素测量差仍视为贴底，不再提示跳转或重复校正', () => {
    vi.useFakeTimers()
    render(<MessageList items={[{ kind: 'assistant', id: 'last', text: '末条' }]} running={false} />)
    act(() => vi.advanceTimersByTime(20))
    const scroller = screen.getByTestId('message-scroller')
    scroller.scrollTop = 1996
    vi.clearAllMocks()
    fireEvent.click(screen.getByRole('button', { name: '模拟离底' }))
    fireEvent.click(screen.getByRole('button', { name: '模拟浮窗末条边距' }))
    fireEvent.click(screen.getByRole('button', { name: '模拟高度校正' }))
    act(() => vi.advanceTimersByTime(20))
    expect(screen.queryByRole('button', { name: /跳到最新/ })).toBeNull()
    expect(scrolling.scrollToBottom).not.toHaveBeenCalled()
  })

  it('已实际贴底时重复尺寸通知不再发起滚动', () => {
    vi.useFakeTimers()
    render(<MessageList items={[{ kind: 'assistant', id: 'last', text: '末条' }]} running={false} />)
    act(() => vi.advanceTimersByTime(20))
    const scroller = screen.getByTestId('message-scroller')
    scroller.scrollTop = 2000
    vi.clearAllMocks()
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: '模拟高度校正' }))
      act(() => vi.advanceTimersByTime(20))
    }
    expect(scrolling.scrollTo).not.toHaveBeenCalled()
    expect(scrolling.scrollToBottom).not.toHaveBeenCalled()
  })

  it('离底通知本身不再次驱动滚动，避免与虚拟列表校正形成反馈', () => {
    vi.useFakeTimers()
    render(<MessageList items={[{ kind: 'assistant', id: 'last', text: '末条' }]} running={false} />)
    act(() => vi.advanceTimersByTime(20))
    vi.clearAllMocks()
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: '模拟离底' }))
      act(() => vi.advanceTimersByTime(20))
    }
    expect(scrolling.scrollTo).not.toHaveBeenCalled()
    expect(scrolling.scrollToBottom).not.toHaveBeenCalled()
  })

  it('权威最近页完成后只发起一次定位，不因清除加载状态再跳一次', async () => {
    vi.useFakeTimers()
    render(<MessageList items={[{ kind: 'assistant', id: 'last', text: '末条' }]} running={false} onLoadLatest={async () => true} />)
    fireEvent.wheel(screen.getByTestId('message-scroller'))
    fireEvent.click(screen.getByRole('button', { name: '模拟离底' }))
    vi.clearAllMocks()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /跳到最新/ })))
    expect(scrolling.scrollToBottom).toHaveBeenCalledTimes(1)
  })

  it('裁掉旧页时按消息身份同步 firstItemIndex，保留末项测量对应关系', () => {
    const items = Array.from({ length: 60 }, (_, index) => ({ kind: 'assistant' as const, id: `m-${index}`, text: `消息 ${index}` }))
    const view = render(<MessageList items={items} running={false} />)
    const firstIndex = Number(screen.getByTestId('message-scroller').dataset.firstIndex)
    view.rerender(<MessageList items={items.slice(-30)} running={false} />)
    expect(Number(screen.getByTestId('message-scroller').dataset.firstIndex)).toBe(firstIndex + 30)
    view.rerender(<MessageList items={items} running={false} />)
    expect(Number(screen.getByTestId('message-scroller').dataset.firstIndex)).toBe(firstIndex)
    const appended = { kind: 'assistant' as const, id: 'm-60', text: '分页期间的新回复' }
    view.rerender(<MessageList items={[...items.slice(20), appended]} running />)
    expect(Number(screen.getByTestId('message-scroller').dataset.firstIndex)).toBe(firstIndex + 20)
    view.rerender(<MessageList items={[...items, appended]} running />)
    expect(Number(screen.getByTestId('message-scroller').dataset.firstIndex)).toBe(firstIndex)
  })

  it('跳转后新的尺寸测量仍可贴底，只有用户上滑才撤销', () => {
    vi.useFakeTimers()
    render(<MessageList items={[{ kind: 'assistant', id: 'last', text: '实际末条' }]} running={false} />)
    fireEvent.wheel(screen.getByRole('button', { name: '模拟离底' }))
    fireEvent.click(screen.getByRole('button', { name: '模拟离底' }))
    fireEvent.click(screen.getByRole('button', { name: /跳到最新/ }))
    act(() => vi.advanceTimersByTime(20))
    scrolling.scrollToBottom.mockClear()
    fireEvent.click(screen.getByRole('button', { name: '模拟贴底' }))
    fireEvent.click(screen.getByRole('button', { name: '模拟离底' }))
    fireEvent.click(screen.getByRole('button', { name: '模拟高度校正' }))
    act(() => vi.advanceTimersByTime(20))
    expect(scrolling.scrollToBottom).toHaveBeenCalledExactlyOnceWith({ top: 2000, behavior: 'auto' })
    fireEvent.wheel(screen.getByRole('button', { name: '模拟离底' }))
    fireEvent.click(screen.getByRole('button', { name: '模拟高度校正' }))
    act(() => vi.advanceTimersByTime(20))
    expect(scrolling.scrollToBottom).toHaveBeenCalledTimes(1)
    expect(scrolling.scrollTo).not.toHaveBeenCalled()
  })

  it('输入区改变列表可用高度时重新贴底，不要求消息总高度发生变化', () => {
    vi.useFakeTimers()
    const callbacks: ResizeObserverCallback[] = []
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { callbacks.push(callback) }
      observe() {} unobserve() {} disconnect() {}
    })
    render(<MessageList items={[{ kind: 'assistant', id: 'last', text: '实际末条' }]} running={false} />)
    fireEvent.click(screen.getByRole('button', { name: '模拟离底' }))
    fireEvent.click(screen.getByRole('button', { name: /跳到最新/ }))
    act(() => vi.advanceTimersByTime(20))
    scrolling.scrollToBottom.mockClear()
    act(() => { callbacks.forEach(callback => callback([], {} as ResizeObserver)); vi.advanceTimersByTime(20) })
    expect(scrolling.scrollToBottom).toHaveBeenCalledExactlyOnceWith({ top: 2000, behavior: 'auto' })
    fireEvent.wheel(screen.getByRole('button', { name: '模拟离底' }))
    act(() => { callbacks.forEach(callback => callback([], {} as ResizeObserver)); vi.advanceTimersByTime(20) })
    expect(scrolling.scrollToBottom).toHaveBeenCalledTimes(1)
  })
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
  it('延迟尺寸变化合并为一次末项定位，用户上滑后停止校正', () => {
    vi.useFakeTimers()
    render(<MessageList items={[{ kind: 'assistant', id: 'long', text: '长回复' }]} running={false} />)
    fireEvent.click(screen.getByRole('button', { name: '模拟离底' }))
    fireEvent.click(screen.getByRole('button', { name: /跳到最新/ }))
    vi.advanceTimersByTime(20)
    scrolling.scrollToBottom.mockClear()
    fireEvent.click(screen.getByRole('button', { name: '模拟高度校正' }))
    fireEvent.click(screen.getByRole('button', { name: '模拟高度校正' }))
    vi.advanceTimersByTime(20)
    expect(scrolling.scrollToBottom).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(3000)
    fireEvent.click(screen.getByRole('button', { name: '模拟高度校正' }))
    vi.advanceTimersByTime(20)
    expect(scrolling.scrollToBottom).toHaveBeenCalledTimes(2)
    fireEvent.wheel(screen.getByRole('button', { name: '模拟离底' }))
    fireEvent.click(screen.getByRole('button', { name: '模拟高度校正' }))
    vi.advanceTimersByTime(20)
    expect(scrolling.scrollToBottom).toHaveBeenCalledTimes(2)
    expect(scrolling.scrollTo).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
  it('跳到当前末项底部，实际贴底前保留恢复入口', () => {
    const view = render(<MessageList items={[{ kind: 'assistant', id: 'long', text: '长回复'.repeat(1000) }]} running={false} />)
    fireEvent.click(screen.getByRole('button', { name: '模拟离底' }))
    fireEvent.click(screen.getByRole('button', { name: /跳到最新/ }))
    expect(scrolling.scrollToBottom).toHaveBeenLastCalledWith({ top: 2000, behavior: 'auto' })
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
    scrolling.scrollToBottom.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /跳到最新/ }))
    expect(onLoadLatest).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '正在获取最新消息…' })).toBeDisabled()
    vi.advanceTimersByTime(3000)
    view.rerender(<MessageList sessionKey="a" items={newItems} running={false} onLoadLatest={onLoadLatest} loadingEarlier />)
    await act(async () => finish(true))
    expect(scrolling.scrollToBottom).not.toHaveBeenCalled()
    view.rerender(<MessageList sessionKey="a" items={newItems} running={false} onLoadLatest={onLoadLatest} />)
    expect(scrolling.scrollToBottom).toHaveBeenLastCalledWith({ top: 2000, behavior: 'auto' })
    act(() => vi.advanceTimersByTime(20))
    expect(scrolling.scrollToBottom).toHaveBeenCalledTimes(1)
    expect(scrolling.scrollTo).not.toHaveBeenCalled()
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
    scrolling.scrollToBottom.mockClear()
    await act(async () => finish(true))
    expect(scrolling.scrollToBottom).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '正在获取最新消息…' })).not.toBeInTheDocument()
  })

  it('会话尚未 ready 时点击跳转，等首次权威页而非提前定位缓存', async () => {
    const onLoadLatest = vi.fn().mockResolvedValue(null)
    const cached = [{ kind: 'assistant' as const, id: 'h-old', text: '缓存末条' }]
    const view = render(<MessageList sessionKey="a" items={cached} running={false} onLoadLatest={onLoadLatest} loadingEarlier />)
    fireEvent.click(screen.getByRole('button', { name: '模拟离底' }))
    scrolling.scrollToBottom.mockClear()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /跳到最新/ })))
    expect(screen.getByRole('button', { name: '正在获取最新消息…' })).toBeDisabled()
    expect(scrolling.scrollToBottom).not.toHaveBeenCalled()
    view.rerender(<MessageList sessionKey="a" items={[{ kind: 'assistant', id: 'h-new', text: '实际末条' }]} running={false} onLoadLatest={onLoadLatest} />)
    expect(onLoadLatest).toHaveBeenCalledOnce()
    expect(scrolling.scrollToBottom).toHaveBeenLastCalledWith({ top: 2000, behavior: 'auto' })
  })

  it('最新页失败保留消息与原位重试，不把缓存末尾当作成功', async () => {
    let finish!: (loaded: boolean) => void
    const onLoadLatest = vi.fn().mockImplementationOnce(() => new Promise<boolean>(resolve => { finish = resolve })).mockResolvedValueOnce(true)
    const items = [{ kind: 'assistant' as const, id: 'h-old', text: '缓存' }]
    const view = render(<MessageList sessionKey="a" items={items} running={false} onLoadLatest={onLoadLatest} />)
    fireEvent.click(screen.getByRole('button', { name: '模拟离底' }))
    scrolling.scrollToBottom.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /跳到最新/ }))
    view.rerender(<MessageList sessionKey="a" items={items} running={false} onLoadLatest={onLoadLatest} loadingEarlier />)
    await act(async () => finish(false))
    view.rerender(<MessageList sessionKey="a" items={items} running={false} onLoadLatest={onLoadLatest} />)
    expect(scrolling.scrollToBottom).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '获取最新消息失败 · 跳到最新重试' })))
    expect(onLoadLatest).toHaveBeenCalledTimes(2)
    expect(scrolling.scrollToBottom).toHaveBeenLastCalledWith({ top: 2000, behavior: 'auto' })
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
