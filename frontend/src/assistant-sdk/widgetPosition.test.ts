import { afterEach, describe, expect, it, vi } from 'vitest'

import { AssistantPositionController, clampPosition } from './widgetPosition'

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 })
})

describe('AssistantPositionController', () => {
  it('keeps surfaces within the visible viewport', () => {
    expect(clampPosition(
      { x: -100, y: 900 },
      { width: 300, height: 200 },
      { width: 1000, height: 700 },
    )).toEqual({ x: 8, y: 492 })
  })

  it('moves and persists a desktop surface after pointer dragging', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    const launcher = document.createElement('button')
    const capsuleIcon = document.createElement('span')
    launcher.append(capsuleIcon)
    const panel = document.createElement('aside')
    const handle = document.createElement('header')
    panel.append(handle)
    document.body.append(launcher, panel)
    vi.spyOn(launcher, 'getBoundingClientRect').mockReturnValue(rect(900, 700, 120, 42))
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(rect(620, 20, 560, 760))
    const controller = new AssistantPositionController({
      launcher, panel, panelHandle: handle, storageKey: 'assistant-position-test', enabled: true,
    })
    controller.start()

    capsuleIcon.dispatchEvent(pointerEvent('pointerdown', 930, 720, 0))
    window.dispatchEvent(pointerEvent('pointermove', 700, 500, 0))
    window.dispatchEvent(pointerEvent('pointerup', 700, 500, 0))

    expect(launcher.style.left).toBe('670px')
    expect(launcher.style.top).toBe('480px')
    expect(window.localStorage.getItem('assistant-position-test')).toContain('"launcher"')
    expect(controller.consumeDrag(launcher)).toBe(true)
    controller.destroy()
    launcher.remove()
    panel.remove()
  })

  it('moves the launcher but keeps the panel fixed in a compact viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 812 })
    const launcher = document.createElement('button')
    const panel = document.createElement('aside')
    const handle = document.createElement('header')
    panel.append(handle)
    document.body.append(launcher, panel)
    vi.spyOn(launcher, 'getBoundingClientRect').mockReturnValue(rect(295, 730, 72, 44))
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 375, 812))
    const controller = new AssistantPositionController({
      launcher, panel, panelHandle: handle, storageKey: 'assistant-position-mobile', enabled: true,
    })
    controller.start()
    launcher.dispatchEvent(pointerEvent('pointerdown', 320, 750, 0))
    window.dispatchEvent(pointerEvent('pointermove', 120, 200, 0))
    window.dispatchEvent(pointerEvent('pointerup', 120, 200, 0))

    handle.dispatchEvent(pointerEvent('pointerdown', 100, 30, 0))
    window.dispatchEvent(pointerEvent('pointermove', 200, 200, 0))
    window.dispatchEvent(pointerEvent('pointerup', 200, 200, 0))

    expect(launcher.style.left).toBe('95px')
    expect(launcher.style.top).toBe('180px')
    expect(panel.style.left).toBe('')
    expect(window.localStorage.getItem('assistant-position-mobile')).toContain('"launcher"')
    expect(window.localStorage.getItem('assistant-position-mobile')).not.toContain('"panel"')
    controller.destroy()
    launcher.remove()
    panel.remove()
  })

  it('restores the saved desktop position after leaving a compact viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 })
    window.localStorage.setItem('assistant-position-responsive', JSON.stringify({
      panel: { x: 120, y: 80 },
    }))
    const launcher = document.createElement('button')
    const panel = document.createElement('aside')
    const handle = document.createElement('header')
    vi.spyOn(launcher, 'getBoundingClientRect').mockReturnValue(rect(850, 700, 120, 42))
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 560, 600))
    const controller = new AssistantPositionController({
      launcher, panel, panelHandle: handle, storageKey: 'assistant-position-responsive', enabled: true,
    })
    controller.start()

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    controller.refresh()

    expect(panel.style.left).toBe('120px')
    expect(panel.style.top).toBe('80px')
    controller.destroy()
  })
})

function pointerEvent(type: string, clientX: number, clientY: number, button: number): PointerEvent {
  return new MouseEvent(type, { bubbles: true, clientX, clientY, button }) as unknown as PointerEvent
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left, top, width, height, x: left, y: top,
    right: left + width, bottom: top + height,
    toJSON: () => ({}),
  }
}
