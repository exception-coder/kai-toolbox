export interface GraphPoint { x: number; y: number }
export interface GraphView extends GraphPoint { scale: number }

/** Side ports keep lines away from the label area below each circle. Opposing nodes bypass Forge. */
export function mobileGraphEdge(a: GraphPoint, b: GraphPoint): string {
  const dx = b.x - a.x, dy = b.y - a.y
  const opposite = Math.hypot((a.x + b.x) / 2, (a.y + b.y) / 2) < 75
  if (opposite && Math.abs(dx) > Math.abs(dy)) {
    const y = Math.min(a.y, b.y) - 90
    return `M ${a.x} ${a.y - 32} C ${a.x} ${y} ${b.x} ${y} ${b.x} ${b.y - 36}`
  }
  const startSide = opposite ? (dy > 0 ? -1 : 1) : (dx > 0 ? 1 : -1)
  const endSide = opposite ? startSide : -startSide
  const startX = a.x + startSide * 120, endX = b.x + endSide * 120
  return `M ${a.x + startSide * 32} ${a.y} C ${startX} ${a.y} ${endX} ${b.y} ${b.x + endSide * 36} ${b.y}`
}

/** Logical pixels: node circles and labels have room of their own, independent of phone aspect ratio. */
export function mobileGraphLayout(names: string[]) {
  const positions = new Map<string, GraphPoint>()
  let offset = 0
  let ring = 0
  while (offset < names.length) {
    const count = Math.min(names.length - offset, 6 + ring * 4)
    const radius = 118 + ring * 112
    for (let index = 0; index < count; index++) {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / count
      positions.set(names[offset + index], { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius })
    }
    offset += count
    ring++
  }
  const points = [{ x: 0, y: 0 }, ...positions.values()]
  const bounds = {
    left: Math.min(...points.map(p => p.x)) - 54,
    right: Math.max(...points.map(p => p.x)) + 54,
    top: Math.min(...points.map(p => p.y)) - 36,
    bottom: Math.max(...points.map(p => p.y)) + 76,
  }
  return { positions, bounds }
}

export function fitMobileGraph(bounds: ReturnType<typeof mobileGraphLayout>['bounds'], width: number, height: number): GraphView {
  const scale = Math.min(1, Math.max(1, width - 40) / (bounds.right - bounds.left), Math.max(1, height - 40) / (bounds.bottom - bounds.top))
  return { scale, x: width / 2 - (bounds.left + bounds.right) / 2 * scale, y: height / 2 - (bounds.top + bounds.bottom) / 2 * scale }
}

/** Keep the world point under the gesture midpoint fixed while zooming. */
export function zoomMobileGraph(view: GraphView, from: GraphPoint, to: GraphPoint, ratio: number): GraphView {
  const scale = Math.max(0.25, Math.min(3, view.scale * ratio))
  return { scale, x: to.x - (from.x - view.x) * scale / view.scale, y: to.y - (from.y - view.y) * scale / view.scale }
}
