import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState, type ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodeAnalysisDialog } from './CodeAnalysisDialog'

afterEach(cleanup)

function props(overrides: Partial<ComponentProps<typeof CodeAnalysisDialog>> = {}): ComponentProps<typeof CodeAnalysisDialog> {
  return {
    title: '样衣删除后刷新统计', score: 60, stale: false, note: '仍有统计刷新逻辑未实现。',
    effort: undefined, deliveryProgress: 70, includeTests: true, onIncludeTests: vi.fn(),
    change: '', onChange: vi.fn(), busy: false, canAnalyze: true, canDevelop: true,
    developing: false, hasDevSession: false, permissionHint: '', onAnalyze: vi.fn(),
    onDevelop: vi.fn(), onClose: vi.fn(), children: <p>具体函数和调用证据</p>, ...overrides,
  }
}

describe('CodeAnalysisDialog', () => {
  it('keeps optional evidence collapsed and toggles scoring without requesting analysis', () => {
    const input = props()
    render(<CodeAnalysisDialog {...input} />)
    expect(screen.getByText('具体函数和调用证据').closest('details')).not.toHaveAttribute('open')
    fireEvent.click(screen.getByText('实现明细与代码证据'))
    expect(screen.getByText('具体函数和调用证据').closest('details')).toHaveAttribute('open')
    fireEvent.click(screen.getByText('分析设置'))
    fireEvent.click(screen.getByRole('checkbox'))
    expect(input.onIncludeTests).toHaveBeenCalledWith(false)
    expect(input.onAnalyze).not.toHaveBeenCalled()
  })

  it('keeps running work closable while disabling submissions', () => {
    const input = props({ busy: true, stage: '正在核对实现证据' })
    render(<CodeAnalysisDialog {...input} />)
    expect(screen.getByRole('status')).toHaveTextContent('正在核对实现证据')
    expect(screen.getByRole('button', { name: '分析中…' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '关闭代码实现分析' }))
    expect(input.onClose).toHaveBeenCalledOnce()
    expect(input.onAnalyze).not.toHaveBeenCalled()
  })

  it('exposes stale results and failures without opening details and allows retry', () => {
    const input = props({ stale: true, error: '暂时无法连接分析服务' })
    render(<CodeAnalysisDialog {...input} />)
    expect(screen.getByRole('alert')).toHaveTextContent('暂时无法连接分析服务')
    expect(screen.getByRole('status')).toHaveTextContent('当前结果已过期')
    fireEvent.click(screen.getByRole('button', { name: '开始分析' }))
    expect(input.onAnalyze).toHaveBeenCalledOnce()
  })

  it('closes with Escape and returns focus to the opening control', async () => {
    function Host() {
      const [open, setOpen] = useState(false)
      return <><button onClick={() => setOpen(true)}>打开分析</button>{open && <CodeAnalysisDialog {...props({ onClose: () => setOpen(false) })} />}</>
    }
    render(<Host />)
    const trigger = screen.getByRole('button', { name: '打开分析' })
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await vi.waitFor(() => expect(trigger).toHaveFocus())
  })
})
