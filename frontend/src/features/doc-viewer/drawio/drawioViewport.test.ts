import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
import { buildDrawioFrame } from './drawioFrame'

function reader(model = { x: -500, y: 200, width: 1600, height: 900 }) {
  const messages: Array<{ state: string; view?: { scale: number; x: number; y: number; overview: boolean } }> = []
  const events: Record<string, (event: Record<string, unknown>) => void> = {}
  const actions: Record<string, (event: Record<string, unknown>) => void> = {}
  const frames: Array<() => void> = []
  let resize!: () => void
  const container = { clientWidth: 320, clientHeight: 336, style: {} as Record<string, string>, replaceChildren() {}, setAttribute() {},
    addEventListener: (type: string, handler: typeof events[string]) => { events[type] = handler },
    getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture() {}, hasPointerCapture: () => false }
  const graph = { view: { scale: 1, translate: { x: 0, y: 0 }, scaleAndTranslate(scale: number, x: number, y: number) { this.scale = scale; this.translate = { x, y } } },
    setPanning: vi.fn(), destroy: vi.fn(), getGraphBounds: () => ({ x: (model.x + graph.view.translate.x) * graph.view.scale, y: (model.y + graph.view.translate.y) * graph.view.scale, width: model.width * graph.view.scale, height: model.height * graph.view.scale }) }
  const parent = { postMessage: (message: typeof messages[number]) => messages.push(message) }
  const window = { GraphViewer: { createViewerForElement: (_element: unknown, done: (viewer: { graph: typeof graph }) => void) => done({ graph }) },
    mxStencilRegistry: { allowEval: true }, Graph: { prototype: { openLink() {} } }, addEventListener: (type: string, handler: typeof actions[string]) => { actions[type] = handler } }
  const html = buildDrawioFrame('https://forge.test', 'test-token')
  const script = [...html.matchAll(/<script nonce="test-token">([\s\S]*?)<\/script>/g)].at(-1)![1]
  runInNewContext(script, { window, document: { getElementById: () => container, addEventListener() {} }, parent, requestAnimationFrame: (run: () => void) => frames.push(run),
    ResizeObserver: class { constructor(callback: () => void) { resize = callback } observe() {} } })
  const flush = () => { while (frames.length) frames.shift()!() }
  const send = (data: object, origin = 'https://forge.test') => { actions.message({ source: parent, origin, data: { token: 'test-token', ...data } }); flush() }
  const pointer = (type: string, id: number, x: number, y: number) => events[type]({ type, pointerId: id, pointerType: 'touch', clientX: x, clientY: y, preventDefault() {}, stopImmediatePropagation() {} })
  return { graph, container, messages, send, pointer, resize: () => { resize(); flush() } }
}

it('executes the actual serialized frame script and fits both axes, negative origins and viewport changes', () => {
  const readerState = reader()
  readerState.send({ action: 'load', xml: '<model/>' })
  function contained() {
    const bounds = readerState.graph.getGraphBounds()
    expect(bounds.x).toBeGreaterThanOrEqual(11.9)
    expect(bounds.y).toBeGreaterThanOrEqual(11.9)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(readerState.container.clientWidth - 11.9)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(readerState.container.clientHeight - 11.9)
  }
  contained()
  readerState.container.clientWidth = 200
  readerState.container.clientHeight = 90
  readerState.resize(); contained()
  expect(readerState.messages.some(message => message.state === 'rendered')).toBe(true)
  expect(readerState.container.style.touchAction).toBe('pan-y pinch-zoom')
  const tall = reader({ x: 700, y: -800, width: 300, height: 2400 })
  tall.send({ action: 'load', xml: '<model/>' })
  expect(tall.graph.getGraphBounds().height).toBeCloseTo(312)
})

it('restores detail position across viewport sizes, isolates messages, and returns to the complete overview', () => {
  const state = reader()
  state.send({ action: 'load', xml: '<model/>', view: { scale: 1.2, x: 800, y: 450, overview: false } })
  const saved = state.messages.at(-2)!.view!
  state.container.clientWidth = 900; state.container.clientHeight = 600; state.resize()
  expect(state.messages.at(-1)!.view).toMatchObject({ scale: saved.scale, x: saved.x, y: saved.y, overview: false })
  state.send({ action: 'fit' }, 'https://untrusted.test')
  expect(state.container.style.touchAction).toBe('none')
  state.send({ action: 'fit' })
  expect(state.messages.at(-1)!.view!.overview).toBe(true)
})

it('handles tap, pinch, drag and cancellation without leaving the graph in a stuck gesture', () => {
  const state = reader()
  state.send({ action: 'load', xml: '<model/>' })
  state.pointer('pointerdown', 1, 100, 100); state.pointer('pointerup', 1, 100, 100)
  expect(state.container.style.touchAction).toBe('none')
  state.pointer('pointerdown', 1, 80, 100); state.pointer('pointerdown', 2, 160, 100)
  const before = state.graph.view.scale
  state.pointer('pointermove', 2, 240, 100)
  expect(state.graph.view.scale).toBeCloseTo(before * 2)
  state.pointer('pointercancel', 1, 80, 100); state.pointer('pointercancel', 2, 240, 100)
  const x = state.graph.view.translate.x
  state.pointer('pointerdown', 3, 100, 100); state.pointer('pointermove', 3, 140, 100); state.pointer('pointerup', 3, 140, 100)
  expect(state.graph.view.translate.x).toBeGreaterThan(x)
  state.send({ action: 'fit' })
  expect(state.container.style.touchAction).toBe('pan-y pinch-zoom')
})
