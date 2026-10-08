import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Markdown } from './Markdown'

const diagram = vi.hoisted(() => ({
  loaded: false,
  initialize: vi.fn(),
  render: vi.fn<(...args: [string, string]) => Promise<{ svg: string }>>(),
}))
vi.mock('mermaid', () => {
  diagram.loaded = true
  return { default: { initialize: diagram.initialize, render: diagram.render } }
})

afterEach(() => cleanup())

describe('Markdown diagram loading', () => {
  it('shows ordinary text without evaluating Mermaid, then loads it for a completed diagram block', async () => {
    const view = render(<Markdown text="普通消息立即可读" />)
    expect(screen.getByText('普通消息立即可读')).toBeInTheDocument()
    expect(diagram.loaded).toBe(false)

    view.rerender(<Markdown text={'```mermaid\ngraph TD; A-->B'} />)
    expect(diagram.loaded).toBe(false)

    diagram.render.mockResolvedValue({ svg: '<svg><text>diagram-ready</text></svg>' })
    view.rerender(<Markdown text={'```mermaid\ngraph TD; A-->B\n```'} />)
    expect(await screen.findByText('diagram-ready')).toBeInTheDocument()
    expect(diagram.loaded).toBe(true)
    expect(diagram.initialize).toHaveBeenCalledOnce()
    expect(diagram.render).toHaveBeenCalledWith(expect.any(String), 'graph TD; A-->B')
  })

  it('preserves source and error feedback when the diagram fails', async () => {
    diagram.render.mockRejectedValue(new Error('invalid-diagram'))
    render(<Markdown text={'```mermaid\ngraph broken\n```'} />)
    expect(await screen.findByText(/mermaid 渲染失败：invalid-diagram/)).toBeInTheDocument()
    expect(screen.getByText('graph broken')).toBeInTheDocument()
  })

  it('does not render after unmounting while the lazy runtime is resolving', async () => {
    const view = render(<Markdown text={'```mermaid\ngraph TD; A-->B\n```'} />)
    view.unmount()
    await act(async () => {})
    expect(diagram.render).not.toHaveBeenCalled()
  })

  it('rejects a late result for the previous diagram content', async () => {
    let finishPrevious!: (result: { svg: string }) => void
    diagram.render.mockImplementationOnce(() => new Promise(resolve => { finishPrevious = resolve }))
      .mockResolvedValue({ svg: '<svg><text>current-diagram</text></svg>' })
    const view = render(<Markdown text={'```mermaid\ngraph TD; A-->B\n```'} />)
    await waitFor(() => expect(diagram.render).toHaveBeenCalledOnce())
    view.rerender(<Markdown text={'```mermaid\ngraph TD; B-->C\n```'} />)
    expect(await screen.findByText('current-diagram')).toBeInTheDocument()
    await act(async () => finishPrevious({ svg: '<svg><text>old-diagram</text></svg>' }))
    expect(screen.queryByText('old-diagram')).not.toBeInTheDocument()
  })
})
