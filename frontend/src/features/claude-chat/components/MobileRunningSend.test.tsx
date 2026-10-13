import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileRunningSend } from './MobileRunningSend'

afterEach(cleanup)

describe('MobileRunningSend', () => {
  it('桌面主按钮直接排队，菜单只在明确选择补充后执行一次', () => {
    const onEnqueue = vi.fn(), onSteer = vi.fn(), onReturnFocus = vi.fn()
    render(<MobileRunningSend desktop canSteer disabled={false} onEnqueue={onEnqueue} onSteer={onSteer} onReturnFocus={onReturnFocus} />)
    fireEvent.click(screen.getByRole('button', { name: '加入队列' }))
    expect(onEnqueue).toHaveBeenCalledOnce()
    expect(onReturnFocus).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: '选择发送方式，默认加入队列' }))
    expect(onSteer).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /补充到当前轮/ }))
    expect(onSteer).toHaveBeenCalledOnce()
    expect(onEnqueue).toHaveBeenCalledOnce()
    expect(screen.queryByText('发送方式')).not.toBeInTheDocument()
  })
  it('桌面不支持补充时不暴露动作，Escape 关闭并恢复焦点', async () => {
    render(<MobileRunningSend desktop canSteer={false} disabled={false} onEnqueue={vi.fn()} onSteer={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: '选择发送方式，默认加入队列' })
    fireEvent.click(trigger)
    expect(screen.queryByRole('button', { name: /补充到当前轮/ })).not.toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('发送方式')).not.toBeInTheDocument()
    await vi.waitFor(() => expect(trigger).toHaveFocus())
  })
  it('打开选择器不发送，明确选择后只调用相应动作', () => {
    const onEnqueue = vi.fn()
    const onSteer = vi.fn()
    render(<MobileRunningSend canSteer disabled={false} onEnqueue={onEnqueue} onSteer={onSteer} />)
    fireEvent.click(screen.getByRole('button', { name: '选择发送方式，默认加入队列' }))
    expect(onEnqueue).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '加入队列（默认）' }))
    expect(onEnqueue).toHaveBeenCalledOnce()
    expect(onSteer).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '选择发送方式，默认加入队列' }))
    fireEvent.click(screen.getByRole('button', { name: '补充到当前轮' }))
    expect(onSteer).toHaveBeenCalledOnce()
  })
  it('不支持补充的引擎只提供排队，空草稿不能打开', () => {
    const props = { canSteer: false, disabled: true, onEnqueue: vi.fn(), onSteer: vi.fn() }
    const view = render(<MobileRunningSend {...props} />)
    expect(screen.getByRole('button', { name: '选择发送方式，默认加入队列' })).toBeDisabled()
    view.rerender(<MobileRunningSend {...props} disabled={false} />)
    fireEvent.click(screen.getByRole('button', { name: '选择发送方式，默认加入队列' }))
    expect(screen.queryByRole('button', { name: '补充到当前轮' })).not.toBeInTheDocument()
    expect(screen.getByText(/异常结束会暂停队列/)).toBeInTheDocument()
  })
})
