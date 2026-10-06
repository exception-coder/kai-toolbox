import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageList } from './MessageList'

const scrolling = vi.hoisted(() => ({ scrollToIndex: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

vi.mock('react-virtuoso', async () => {
  const { forwardRef, useImperativeHandle } = await import('react')
  return {
    Virtuoso: forwardRef(function VirtuosoMock(props: {
      components: { Header: ComponentType<{ context?: unknown }> }
      context: unknown
      startReached?: () => void
      atBottomStateChange: (value: boolean) => void
    }, ref) {
      useImperativeHandle(ref, () => ({ scrollToIndex: scrolling.scrollToIndex }))
      const Header = props.components.Header
      return <><Header context={props.context} /><span data-testid="automatic-history-load">{String(Boolean(props.startReached))}</span>
        <button onClick={() => props.atBottomStateChange(false)}>模拟离底</button>
        <button onClick={() => props.atBottomStateChange(true)}>模拟贴底</button></>
    }),
  }
})

describe('MessageList 历史分页入口', () => {
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
