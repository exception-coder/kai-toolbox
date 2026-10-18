import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AssistantLauncher } from './AssistantLauncher'

const storageKey = 'forge:work-assistants:launcher:7:v1'
const launch = vi.fn()
class TestPointer extends MouseEvent {
  pointerId: number
  isPrimary: boolean
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init); this.pointerId = init.pointerId ?? 1; this.isPrimary = init.isPrimary ?? true
  }
}
beforeEach(() => {
  localStorage.clear(); launch.mockClear()
  vi.stubGlobal('PointerEvent', TestPointer)
  vi.stubGlobal('innerWidth', 390); vi.stubGlobal('innerHeight', 844)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

const toolbar = () => screen.getByRole('toolbar', { name: '工作助理快捷入口' })
function primary() {
  const control = screen.getByRole('button', { name: /^(展开|唤醒)工作助理$/ })
  control.setPointerCapture = vi.fn()
  control.hasPointerCapture = vi.fn(() => true)
  control.releasePointerCapture = vi.fn()
  control.getBoundingClientRect = () => ({ left: Number.parseFloat(toolbar().style.left), top: Number.parseFloat(toolbar().style.top), width: 28, height: 44 } as DOMRect)
  return control
}
function start(control: HTMLElement, pointerId = 1) {
  const rect = control.getBoundingClientRect()
  const position = { clientX: rect.left + 14, clientY: rect.top + 22, pointerId, button: 0, isPrimary: true }
  fireEvent.pointerDown(control, position)
  return position
}

it('starts as a small edge tab, expands without launching and explicitly docks to the nearest edge', () => {
  render(<AssistantLauncher userId={7} suspended={false} onLaunch={launch} />)
  expect(toolbar()).toHaveClass('is-collapsed')
  expect(toolbar().style.left).toBe('362px')
  fireEvent.click(primary())
  expect(launch).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '唤醒工作助理' }))
  expect(launch).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: '收起工作助理' }))
  expect(primary()).toHaveFocus()
  expect(toolbar()).toHaveClass('is-collapsed')
  expect(JSON.parse(localStorage.getItem(storageKey)!)).toMatchObject({ side: 'right', collapsed: true })
})

it('touch drags a tab into the page, ignores other pointers and never opens on the generated click', () => {
  render(<AssistantLauncher userId={7} suspended={false} onLaunch={launch} />)
  const control = primary(), initial = start(control)
  fireEvent.pointerMove(control, { ...initial, clientX: 140, clientY: 220, pointerId: 9 })
  expect(toolbar()).toHaveClass('is-collapsed')
  fireEvent.pointerMove(control, { ...initial, clientX: 140, clientY: 220, pointerType: 'touch' })
  fireEvent.pointerUp(control, { ...initial, clientX: 140, clientY: 220 })
  fireEvent.click(control, { detail: 1 })
  expect(toolbar()).not.toHaveClass('is-collapsed')
  expect(Number.parseFloat(toolbar().style.left)).toBeCloseTo(126)
  expect(launch).not.toHaveBeenCalled()
  const saved = JSON.parse(localStorage.getItem(storageKey)!)
  expect(saved).toMatchObject({ side: null, collapsed: false })
  cleanup()
  render(<AssistantLauncher userId={7} suspended={false} onLaunch={launch} />)
  expect(Number.parseFloat(toolbar().style.left)).toBeCloseTo(126)
})

it('docks after dragging to the left edge, and cancelled gestures restore the original position', () => {
  render(<AssistantLauncher userId={7} suspended={false} onLaunch={launch} />)
  const control = primary(), initial = start(control)
  fireEvent.pointerMove(control, { ...initial, clientX: 8, clientY: 150 })
  fireEvent.pointerUp(control, { ...initial, clientX: 8, clientY: 150 })
  fireEvent.click(control, { detail: 1 })
  expect(toolbar()).toHaveAttribute('data-side', 'left')
  expect(toolbar().style.left).toBe('0px')
  expect(toolbar()).toHaveClass('is-collapsed')
  const leftPosition = toolbar().style.top, next = start(control)
  fireEvent.pointerMove(control, { ...next, clientX: 180, clientY: 600 })
  fireEvent.pointerCancel(control, { ...next, clientX: 180, clientY: 600 })
  expect(toolbar()).toHaveAttribute('data-side', 'left')
  expect(toolbar().style.top).toBe(leftPosition)
  fireEvent.click(control) // Keyboard / assistive activation still works after a cancelled gesture.
  expect(toolbar()).not.toHaveClass('is-collapsed')
  expect(launch).not.toHaveBeenCalled()
})

it('treats small movement as a click and supports keyboard movement, collapse and reset', () => {
  render(<AssistantLauncher userId={7} suspended={false} onLaunch={launch} />)
  const control = primary(), initial = start(control)
  fireEvent.pointerMove(control, { ...initial, clientX: initial.clientX - 2 })
  fireEvent.pointerUp(control, initial); fireEvent.click(control, { detail: 1 })
  expect(toolbar()).not.toHaveClass('is-collapsed')
  const before = Number.parseFloat(toolbar().style.left)
  fireEvent.keyDown(control, { key: 'ArrowLeft' })
  expect(Number.parseFloat(toolbar().style.left)).toBeCloseTo(before - 32)
  fireEvent.keyDown(control, { key: 'Escape' })
  expect(toolbar()).toHaveClass('is-collapsed')
  fireEvent.keyDown(control, { key: 'Home' })
  expect(toolbar()).toHaveAttribute('data-side', 'right')
  expect(JSON.parse(localStorage.getItem(storageKey)!)).toMatchObject({ y: 0.45, collapsed: true })
})

it('recovers from lost capture or Escape during a drag and ignores secondary button presses', () => {
  render(<AssistantLauncher userId={7} suspended={false} onLaunch={launch} />)
  const control = primary(), original = toolbar().style.cssText
  fireEvent.pointerDown(control, { pointerId: 1, button: 2, clientX: 370, clientY: 400 })
  fireEvent.pointerMove(control, { pointerId: 1, clientX: 100, clientY: 100 })
  expect(toolbar().style.cssText).toBe(original)
  const initial = start(control)
  fireEvent.pointerMove(control, { ...initial, clientX: 120, clientY: 120 })
  fireEvent.lostPointerCapture(control, { pointerId: 1 })
  expect(toolbar().style.cssText).toBe(original)
  const retry = start(control)
  fireEvent.pointerMove(control, { ...retry, clientX: 150, clientY: 150 })
  fireEvent.keyDown(control, { key: 'Escape' })
  expect(toolbar().style.cssText).toBe(original)
  fireEvent.pointerUp(control, { ...retry, clientX: 150, clientY: 150 })
  fireEvent.click(control, { detail: 1 })
  expect(launch).not.toHaveBeenCalled()
})

it('respects device safe-area insets on initial mount and when docking to either edge', () => {
  const computed = window.getComputedStyle.bind(window)
  const insets: Record<string, string> = { '--wa-safe-left': '20px', '--wa-safe-right': '20px', '--wa-safe-top': '40px', '--wa-safe-bottom': '30px' }
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => {
    const style = computed(element)
    if (!element.classList.contains('wa-launcher')) return style
    return new Proxy(style, { get(target, property) {
      if (property === 'getPropertyValue') return (name: string) => insets[name] ?? target.getPropertyValue(name)
      const value = Reflect.get(target, property)
      return typeof value === 'function' ? value.bind(target) : value
    } })
  })
  render(<AssistantLauncher userId={7} suspended={false} onLaunch={launch} />)
  expect(toolbar().style.left).toBe('342px')
  const control = primary(), initial = start(control)
  fireEvent.pointerMove(control, { ...initial, clientX: 1, clientY: 0 })
  fireEvent.pointerUp(control, { ...initial, clientX: 1, clientY: 0 })
  expect(toolbar().style.left).toBe('20px')
  expect(Number.parseFloat(toolbar().style.top)).toBeGreaterThanOrEqual(40)
})

it('keeps the tab within the visual viewport during keyboard/zoom changes and survives storage failure', () => {
  const visual = new EventTarget()
  Object.assign(visual, { width: 320, height: 330, offsetLeft: 8, offsetTop: 42 })
  vi.stubGlobal('visualViewport', visual)
  localStorage.setItem(storageKey, JSON.stringify({ x: 99, y: 99, side: 'right', collapsed: true }))
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage unavailable') })
  const view = render(<AssistantLauncher userId={7} suspended={false} onLaunch={launch} />)
  expect(toolbar().style.left).toBe('300px')
  expect(Number.parseFloat(toolbar().style.top) + 44).toBeLessThanOrEqual(372)
  fireEvent.click(primary())
  Object.assign(visual, { width: 180, height: 240, offsetTop: 60 })
  act(() => { visual.dispatchEvent(new Event('resize')) })
  expect(Number.parseFloat(toolbar().style.left) + 76).toBeLessThanOrEqual(188)
  expect(Number.parseFloat(toolbar().style.top) + 44).toBeLessThanOrEqual(300)
  view.rerender(<AssistantLauncher userId={7} suspended onLaunch={launch} />)
  expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
})

it('falls back from corrupt preferences and keeps separate local positions for different users', () => {
  localStorage.setItem(storageKey, '{broken')
  const view = render(<AssistantLauncher key={7} userId={7} suspended={false} onLaunch={launch} />)
  fireEvent.click(primary())
  expect(toolbar()).not.toHaveClass('is-collapsed')
  view.rerender(<AssistantLauncher key={8} userId={8} suspended={false} onLaunch={launch} />)
  expect(toolbar()).toHaveClass('is-collapsed')
  expect(localStorage.getItem('forge:work-assistants:launcher:8:v1')).toBeNull()
})
