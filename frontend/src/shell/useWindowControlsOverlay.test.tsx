import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWindowControlsOverlay } from './useWindowControlsOverlay'

type OverlayListener = EventListener

class WindowControlsOverlayStub {
  visible: boolean
  private readonly listeners = new Set<OverlayListener>()

  readonly addEventListener = vi.fn((_type: 'geometrychange', listener: OverlayListener) => {
    this.listeners.add(listener)
  })

  readonly removeEventListener = vi.fn((_type: 'geometrychange', listener: OverlayListener) => {
    this.listeners.delete(listener)
  })

  constructor(visible: boolean) {
    this.visible = visible
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    const event = new Event('geometrychange')
    this.listeners.forEach(listener => listener(event))
  }
}

const originalOverlayDescriptor = Object.getOwnPropertyDescriptor(navigator, 'windowControlsOverlay')

function installOverlay(value: WindowControlsOverlayStub | undefined): void {
  Object.defineProperty(navigator, 'windowControlsOverlay', {
    configurable: true,
    value,
  })
}

describe('useWindowControlsOverlay', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.windowControlsOverlay
  })

  afterEach(() => {
    delete document.documentElement.dataset.windowControlsOverlay
    if (originalOverlayDescriptor) {
      Object.defineProperty(navigator, 'windowControlsOverlay', originalOverlayDescriptor)
    } else {
      delete (navigator as Navigator & { windowControlsOverlay?: unknown }).windowControlsOverlay
    }
  })

  it('在浏览器不提供 Window Controls Overlay API 时安全回退', () => {
    installOverlay(undefined)

    const { result, unmount } = renderHook(() => useWindowControlsOverlay())

    expect(result.current).toBe(false)
    expect(document.documentElement).not.toHaveAttribute('data-window-controls-overlay')

    unmount()
    expect(document.documentElement).not.toHaveAttribute('data-window-controls-overlay')
  })

  it('以 API 的 visible 初值启用统一标题栏并在卸载时清理', () => {
    const overlay = new WindowControlsOverlayStub(true)
    installOverlay(overlay)

    const { result, unmount } = renderHook(() => useWindowControlsOverlay())

    expect(result.current).toBe(true)
    expect(document.documentElement).toHaveAttribute('data-window-controls-overlay', 'true')
    expect(overlay.addEventListener).toHaveBeenCalledWith('geometrychange', expect.any(Function))

    unmount()

    expect(overlay.removeEventListener).toHaveBeenCalledWith('geometrychange', expect.any(Function))
    expect(document.documentElement).not.toHaveAttribute('data-window-controls-overlay')
  })

  it('随 geometrychange 在显示与隐藏之间同步并停止响应已卸载 Hook', () => {
    const overlay = new WindowControlsOverlayStub(false)
    installOverlay(overlay)

    const { result, unmount } = renderHook(() => useWindowControlsOverlay())
    expect(result.current).toBe(false)

    act(() => overlay.setVisible(true))
    expect(result.current).toBe(true)
    expect(document.documentElement).toHaveAttribute('data-window-controls-overlay', 'true')

    act(() => overlay.setVisible(false))
    expect(result.current).toBe(false)
    expect(document.documentElement).not.toHaveAttribute('data-window-controls-overlay')

    unmount()
    act(() => overlay.setVisible(true))
    expect(document.documentElement).not.toHaveAttribute('data-window-controls-overlay')
  })
})
