import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Boxes } from 'lucide-react'
import { MobileSystemGraph } from './MobileSystemGraph'
import { fitMobileGraph, mobileGraphLayout, zoomMobileGraph } from '../mobileGraphLayout'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('fits the entire network with safe margins on portrait, narrow and landscape screens', () => {
  for (const count of [1, 4, 8, 16]) {
    const { bounds } = mobileGraphLayout(Array.from({ length: count }, (_, i) => String(i)))
    for (const [width, height] of [[390, 688], [320, 400], [650, 220]]) {
      const view = fitMobileGraph(bounds, width, height)
      expect(bounds.left * view.scale + view.x).toBeGreaterThanOrEqual(19.99)
      expect(bounds.right * view.scale + view.x).toBeLessThanOrEqual(width - 19.99)
      expect(bounds.top * view.scale + view.y).toBeGreaterThanOrEqual(19.99)
      expect(bounds.bottom * view.scale + view.y).toBeLessThanOrEqual(height - 19.99)
    }
  }
})

it('anchors pinch zoom to the gesture midpoint and bounds extreme scaling', () => {
  const view = { x: 100, y: 200, scale: 1 }
  const zoomed = zoomMobileGraph(view, { x: 150, y: 260 }, { x: 160, y: 270 }, 2)
  expect(zoomed).toEqual({ x: 60, y: 150, scale: 2 })
  expect(zoomMobileGraph(view, { x: 0, y: 0 }, { x: 0, y: 0 }, 99).scale).toBe(3)
})

function mount(overrides: Partial<React.ComponentProps<typeof MobileSystemGraph>> = {}) {
  let resize = () => {}
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resize = callback } observe() {} disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 390, height: 650, left: 0, top: 0 } as DOMRect)
  const props = {
    systems: ['ERP', 'SRM', 'SCM'].map(name => ({ name, label: name, Icon: Boxes, category: 'all' })),
    links: [{ from: 'ERP', to: 'SRM', relation: '数据同步', description: '' }], categories: [{ key: 'all', label: '业务系统' }],
    category: null, onCategory: vi.fn(), onConsult: vi.fn(), loading: false, error: false, canConsult: true, onRetry: vi.fn(), ...overrides,
  }
  const result = render(<MobileSystemGraph {...props} />)
  return { ...result, props, resize: () => act(resize) }
}

it('shows relations on demand, dims unrelated nodes and closes without resetting the view', () => {
  const { props, resize } = mount()
  expect(screen.queryByText('数据同步')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '放大图谱' }))
  const transform = screen.getByTestId('mobile-graph-world').style.transform
  fireEvent.click(screen.getByRole('button', { name: 'ERP' }))
  expect(screen.getByRole('button', { name: 'SCM' })).toHaveStyle({ opacity: '0.28' })
  expect(within(screen.getByRole('region', { name: 'ERP 的关联关系' })).getByText('数据同步')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '咨询此系统' }))
  expect(props.onConsult).toHaveBeenCalledWith('ERP')
  fireEvent.click(screen.getByRole('button', { name: '关闭系统详情' }))
  resize()
  expect(screen.getByTestId('mobile-graph-world').style.transform).toBe(transform)
  expect(screen.getByRole('button', { name: 'ERP' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: '定位全图' }))
  expect(screen.getByTestId('mobile-graph-world').style.transform).not.toBe(transform)
})

it('retains filtering in the parent and provides loading, error retry and empty recovery', () => {
  const { props, rerender } = mount({ error: true })
  fireEvent.click(screen.getByRole('button', { name: '重新加载' }))
  expect(props.onRetry).toHaveBeenCalledOnce()
  rerender(<MobileSystemGraph {...props} error={false} loading />)
  expect(screen.getByRole('status')).toHaveTextContent('正在加载')
  rerender(<MobileSystemGraph {...props} error={false} systems={[]} />)
  expect(screen.getByText(/暂无已配置的业务系统/)).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'all' } })
  expect(props.onCategory).toHaveBeenCalledWith('all')
})

it('pans and pinches without treating a drag or cancelled gesture as a node tap', () => {
  class TestPointerEvent extends MouseEvent {
    pointerId: number
    constructor(type: string, init: PointerEventInit) { super(type, init); this.pointerId = init.pointerId ?? 1 }
  }
  vi.stubGlobal('PointerEvent', TestPointerEvent)
  const capture = vi.fn()
  Object.defineProperty(Element.prototype, 'setPointerCapture', { configurable: true, value: capture })
  const { container } = mount()
  const canvas = container.querySelector('.fc-mobile-map-canvas')!
  const node = screen.getByRole('button', { name: 'ERP' })
  const initial = screen.getByTestId('mobile-graph-world').style.transform
  fireEvent.pointerDown(node, { pointerId: 1, clientX: 100, clientY: 200, button: 0 })
  fireEvent.pointerMove(node, { pointerId: 1, clientX: 130, clientY: 200 })
  fireEvent.pointerUp(node, { pointerId: 1 })
  fireEvent.click(node, { detail: 1 })
  expect(screen.queryByRole('region', { name: 'ERP 的关联关系' })).not.toBeInTheDocument()
  expect(screen.getByTestId('mobile-graph-world').style.transform).not.toBe(initial)
  fireEvent.click(screen.getByRole('button', { name: '定位全图' }))
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 200, button: 0 })
  fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 200, clientY: 200, button: 0 })
  fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 250, clientY: 200 })
  expect(screen.getByTestId('mobile-graph-world').style.transform).toContain('scale(1.5)')
  fireEvent.pointerCancel(canvas, { pointerId: 1 })
  fireEvent.pointerCancel(canvas, { pointerId: 2 })
  fireEvent.click(node, { detail: 1 })
  expect(node).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(node, { detail: 0 })
  expect(node).toHaveAttribute('aria-pressed', 'true')
  delete (Element.prototype as Partial<Element>).setPointerCapture
})
