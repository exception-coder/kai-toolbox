import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ConsultAnswerContent, ConsultPanel } from './ConsultPanel'

let resized: ResizeObserverCallback
let parentWidth = 1200
beforeEach(() => {
  parentWidth = 1200
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width: parentWidth } as DOMRect))
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resized = callback }
    observe() {} disconnect() {}
  })
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerId: number
    constructor(type: string, init: PointerEventInit) { super(type, init); this.pointerId = init.pointerId ?? 1 }
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function mount(side: 'left' | 'right' = 'left') {
  const outside = vi.fn()
  render(<div onClick={outside}><ConsultPanel side={side} initialWidth={520} className="test-panel">
    {controls => <><header>{controls}</header><textarea aria-label="追问草稿" /></>}
  </ConsultPanel></div>)
  screen.getByRole('separator').setPointerCapture = vi.fn()
  return outside
}

it('resizes without dismissing the conversation and restores the same draft after expansion', () => {
  const outside = mount()
  const handle = screen.getByRole('separator', { name: '调整对话窗口宽度' })
  const draft = screen.getByRole('textbox', { name: '追问草稿' })
  fireEvent.change(draft, { target: { value: '请解释表格最后一列' } })
  fireEvent.pointerDown(handle, { clientX: 520, button: 0, pointerId: 1 })
  fireEvent.pointerMove(handle, { clientX: 820, pointerId: 1 })
  fireEvent.pointerUp(handle, { pointerId: 1 })
  expect(handle).toHaveAttribute('aria-valuenow', '820')
  fireEvent.click(screen.getByRole('button', { name: '展开对话窗口' }))
  expect(screen.queryByRole('separator')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '还原对话窗口' }))
  expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '820')
  expect(screen.getByRole('textbox')).toBe(draft)
  expect(draft).toHaveValue('请解释表格最后一列')
  expect(outside).not.toHaveBeenCalled()
})

it('supports the archive left edge, keyboard limits and cancellation while clamping to its parent', () => {
  mount('right')
  const handle = screen.getByRole('separator')
  fireEvent.keyDown(handle, { key: 'ArrowLeft' })
  expect(handle).toHaveAttribute('aria-valuenow', '552')
  fireEvent.keyDown(handle, { key: 'Home' })
  expect(handle).toHaveAttribute('aria-valuenow', '360')
  fireEvent.keyDown(handle, { key: 'End' })
  expect(handle).toHaveAttribute('aria-valuenow', '1176')
  fireEvent.pointerDown(handle, { clientX: 500, button: 0, pointerId: 2 })
  fireEvent.pointerCancel(handle, { pointerId: 2 })
  fireEvent.pointerMove(handle, { clientX: 800, pointerId: 2 })
  expect(handle).toHaveAttribute('aria-valuenow', '1176')
  parentWidth = 480
  act(() => resized([], {} as ResizeObserver))
  expect(handle).toHaveAttribute('aria-valuenow', '456')
  fireEvent.doubleClick(handle)
  expect(handle).toHaveAttribute('aria-valuenow', '456')
})

it('keeps asynchronously rendered tables, columns and content available to keyboard users', async () => {
  const content = <table><thead><tr><th>系统</th><th>判断依据</th></tr></thead><tbody><tr><td>ERP</td><td>尚待业务核验</td></tr></tbody></table>
  const { rerender } = render(<ConsultAnswerContent text="表格"><span>加载表格</span></ConsultAnswerContent>)
  rerender(<ConsultAnswerContent text="表格">{content}</ConsultAnswerContent>)
  expect(await screen.findByRole('table', { name: '咨询表格 1，可横向滚动' })).toHaveAttribute('tabindex', '0')
  expect(screen.getByRole('columnheader', { name: '判断依据' })).toBeInTheDocument()
  expect(screen.getByRole('cell', { name: '尚待业务核验' })).toBeInTheDocument()
})
