export interface Point {
  x: number
  y: number
}

interface StoredPositions {
  launcher?: Point
  panel?: Point
}

interface PositionControllerOptions {
  launcher: HTMLElement
  panel: HTMLElement
  panelHandle: HTMLElement
  storageKey: string
  enabled: boolean
}

type SurfaceName = keyof StoredPositions

const VIEWPORT_MARGIN = 8
const COMPACT_VIEWPORT_MAX_WIDTH = 620
const KEYBOARD_MOVE_STEP = 16

/** Assistant 胶囊及桌面悬浮面板的位置恢复、拖动和视口约束。 */
export class AssistantPositionController {
  private readonly options: PositionControllerOptions
  private readonly cleanups: Array<() => void> = []
  private restoreTimer?: number
  private started = false

  constructor(options: PositionControllerOptions) {
    this.options = options
  }

  start(): void {
    if (this.started || !this.options.enabled) return
    this.started = true
    this.bindSurface('launcher', this.options.launcher, this.options.launcher)
    this.bindSurface('panel', this.options.panel, this.options.panelHandle)
    const resize = () => this.clampVisibleSurfaces()
    window.addEventListener('resize', resize)
    this.cleanups.push(() => window.removeEventListener('resize', resize))
    this.restoreTimer = window.setTimeout(() => this.restore(), 0)
  }

  destroy(): void {
    if (this.restoreTimer !== undefined) window.clearTimeout(this.restoreTimer)
    this.cleanups.splice(0).forEach(cleanup => cleanup())
    this.started = false
  }

  reset(): void {
    this.write({})
    this.clearInlinePosition(this.options.launcher)
    this.clearInlinePosition(this.options.panel)
  }

  refresh(): void {
    if (!this.started) return
    this.clampVisibleSurfaces()
  }

  consumeDrag(element: HTMLElement): boolean {
    const dragged = element.dataset.justDragged === 'true'
    delete element.dataset.justDragged
    return dragged
  }

  private bindSurface(name: SurfaceName, surface: HTMLElement, handle: HTMLElement): void {
    let stopActiveDrag: (() => void) | undefined
    const pointerDown = (event: PointerEvent) => {
      if (!this.canMove(name) || event.button !== 0 || isInteractiveDragTarget(event.target, handle)) return
      event.preventDefault()
      const startRect = surface.getBoundingClientRect()
      const start = { x: event.clientX, y: event.clientY }
      let moved = false
      surface.classList.add('dragging')

      const pointerMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - start.x
        const deltaY = moveEvent.clientY - start.y
        moved ||= Math.abs(deltaX) + Math.abs(deltaY) > 4
        this.place(surface, { x: startRect.left + deltaX, y: startRect.top + deltaY })
      }
      const pointerUp = () => {
        stopActiveDrag?.()
        stopActiveDrag = undefined
        surface.classList.remove('dragging')
        if (!moved) return
        surface.dataset.justDragged = 'true'
        this.persist(name, surface)
      }
      stopActiveDrag = () => {
        window.removeEventListener('pointermove', pointerMove)
        window.removeEventListener('pointerup', pointerUp)
        window.removeEventListener('pointercancel', pointerUp)
      }
      window.addEventListener('pointermove', pointerMove)
      window.addEventListener('pointerup', pointerUp)
      window.addEventListener('pointercancel', pointerUp)
    }
    const keyDown = (event: KeyboardEvent) => {
      if (!this.canMove(name) || !event.altKey || !event.key.startsWith('Arrow')) return
      event.preventDefault()
      const rect = surface.getBoundingClientRect()
      const delta = arrowDelta(event.key)
      this.place(surface, {
        x: rect.left + delta.x * KEYBOARD_MOVE_STEP,
        y: rect.top + delta.y * KEYBOARD_MOVE_STEP,
      })
      this.persist(name, surface)
    }
    handle.addEventListener('pointerdown', pointerDown)
    handle.addEventListener('keydown', keyDown)
    this.cleanups.push(() => {
      stopActiveDrag?.()
      handle.removeEventListener('pointerdown', pointerDown)
      handle.removeEventListener('keydown', keyDown)
    })
  }

  private restore(): void {
    const stored = this.read()
    if (stored.launcher) this.place(this.options.launcher, stored.launcher)
    if (!this.isCompact() && stored.panel) this.place(this.options.panel, stored.panel)
  }

  private clampVisibleSurfaces(): void {
    if (this.isCompact()) {
      this.clearInlinePosition(this.options.panel)
      const launcherPosition = this.read().launcher
      if (!this.options.launcher.hidden && launcherPosition) {
        this.place(this.options.launcher, launcherPosition)
      }
      return
    }
    const stored = this.read()
    if (!this.options.launcher.hidden) {
      this.place(this.options.launcher, stored.launcher ?? pointOf(this.options.launcher))
    }
    if (!this.options.panel.hidden) {
      this.place(this.options.panel, stored.panel ?? pointOf(this.options.panel))
    }
  }

  private place(surface: HTMLElement, point: Point): void {
    const rect = surface.getBoundingClientRect()
    const clamped = clampPosition(point, { width: rect.width, height: rect.height }, {
      width: window.innerWidth,
      height: window.innerHeight,
    })
    surface.style.left = `${clamped.x}px`
    surface.style.top = `${clamped.y}px`
    surface.style.right = 'auto'
    surface.style.bottom = 'auto'
  }

  private persist(name: SurfaceName, surface: HTMLElement): void {
    const stored = this.read()
    stored[name] = pointOf(surface)
    this.write(stored)
  }

  private read(): StoredPositions {
    try {
      const raw = window.localStorage.getItem(this.options.storageKey)
      return raw ? JSON.parse(raw) as StoredPositions : {}
    } catch {
      return {}
    }
  }

  private write(value: StoredPositions): void {
    try {
      if (Object.keys(value).length === 0) window.localStorage.removeItem(this.options.storageKey)
      else window.localStorage.setItem(this.options.storageKey, JSON.stringify(value))
    } catch {
      // 禁用存储或配额不足时，当前位置仅在当前页面有效。
    }
  }

  private clearInlinePosition(surface: HTMLElement): void {
    surface.style.removeProperty('left')
    surface.style.removeProperty('top')
    surface.style.removeProperty('right')
    surface.style.removeProperty('bottom')
  }

  private isCompact(): boolean {
    return window.innerWidth <= COMPACT_VIEWPORT_MAX_WIDTH
  }

  private canMove(name: SurfaceName): boolean {
    return name === 'launcher' || !this.isCompact()
  }
}

export function clampPosition(point: Point, surface: { width: number; height: number },
                              viewport: { width: number; height: number }): Point {
  const maxX = Math.max(VIEWPORT_MARGIN, viewport.width - surface.width - VIEWPORT_MARGIN)
  const maxY = Math.max(VIEWPORT_MARGIN, viewport.height - surface.height - VIEWPORT_MARGIN)
  return {
    x: Math.min(Math.max(point.x, VIEWPORT_MARGIN), maxX),
    y: Math.min(Math.max(point.y, VIEWPORT_MARGIN), maxY),
  }
}

function pointOf(element: HTMLElement): Point {
  const rect = element.getBoundingClientRect()
  return { x: rect.left, y: rect.top }
}

function arrowDelta(key: string): Point {
  switch (key) {
    case 'ArrowLeft': return { x: -1, y: 0 }
    case 'ArrowRight': return { x: 1, y: 0 }
    case 'ArrowUp': return { x: 0, y: -1 }
    case 'ArrowDown': return { x: 0, y: 1 }
    default: return { x: 0, y: 0 }
  }
}

function isInteractiveDragTarget(target: EventTarget | null, handle: HTMLElement): boolean {
  if (!(target instanceof Element) || target === handle) return false
  const interactiveAncestor = target.closest('button, input, textarea, select, a, [data-no-drag]')
  return interactiveAncestor !== null && interactiveAncestor !== handle
}
