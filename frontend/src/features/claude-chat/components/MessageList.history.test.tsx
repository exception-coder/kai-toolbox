import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MessageList } from './MessageList'

vi.mock('react-virtuoso', async () => {
  const { forwardRef } = await import('react')
  return {
    Virtuoso: forwardRef(function VirtuosoMock(props: {
      components: { Header: ComponentType<{ context?: unknown }> }
      context: unknown
    }, _ref) {
      const Header = props.components.Header
      return <Header context={props.context} />
    }),
  }
})

describe('MessageList 历史分页入口', () => {
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
