export interface DrawioViewState { scale: number; x: number; y: number; overview: boolean }

/** Self-contained: serialized into the opaque-origin frame, with no parent DOM or module access. */
export function installDrawioViewport(host: string, token: string) {
  type Point = { x: number; y: number }
  type Graph = {
    view: { scale: number; translate: Point; scaleAndTranslate: (scale: number, x: number, y: number) => void }
    getGraphBounds: () => Point & { width: number; height: number }
    destroy: () => void
    setPanning: (enabled: boolean) => void
  }
  const runtime = window as unknown as {
    GraphViewer?: { createViewerForElement: (container: HTMLElement, callback: (viewer: { graph: Graph }) => void) => void }
    mxStencilRegistry?: { allowEval: boolean }
    Graph: { prototype: { openLink: () => void } }
  }
  let graph: Graph | undefined, overview = true, fitScale = 1, generation = 0
  let width = 0, height = 0, resizeQueued = false
  let gesture: { center: Point; distance: number; view: DrawioViewState } | undefined
  let lastTap: { time: number; point: Point } | undefined, moved = false, hadPinch = false
  const pointers = new Map<number, Point>()
  const container = document.getElementById('diagram')!
  const report = (state: string, extra: object = {}) => parent.postMessage({ type: 'forge-drawio', token, state, ...extra }, host)
  if (!runtime.GraphViewer || !runtime.mxStencilRegistry) { report('error'); return }
  runtime.mxStencilRegistry.allowEval = false
  runtime.Graph.prototype.openLink = () => {}
  container.style.width = container.style.height = '100%'
  container.tabIndex = 0
  container.setAttribute('aria-label', '图纸画布：加减号缩放，方向键平移，0 返回全貌')
  const size = () => ({ width: container.clientWidth, height: container.clientHeight })
  const snapshot = (): DrawioViewState => ({ scale: graph!.view.scale,
    x: width / (2 * graph!.view.scale) - graph!.view.translate.x,
    y: height / (2 * graph!.view.scale) - graph!.view.translate.y, overview })
  const publish = () => { if (graph) report('viewport', { view: snapshot() }) }
  const setInteraction = () => {
    container.style.touchAction = overview ? 'pan-y pinch-zoom' : 'none'
    container.style.overscrollBehavior = overview ? 'auto' : 'contain'
    container.style.cursor = overview ? 'zoom-in' : 'grab'
  }
  function restore(view: DrawioViewState) {
    if (!graph || ![view.scale, view.x, view.y].every(Number.isFinite) || view.scale <= 0) return
    overview = view.overview
    graph.view.scaleAndTranslate(view.scale, width / (2 * view.scale) - view.x, height / (2 * view.scale) - view.y)
    setInteraction(); publish()
  }
  function fit() {
    if (!graph) return
    const bounds = graph.getGraphBounds(), view = graph.view
    const current = view.scale
    const extent = { x: bounds.x / current - view.translate.x, y: bounds.y / current - view.translate.y,
      width: bounds.width / current, height: bounds.height / current }
    const dimensions = size(); width = dimensions.width; height = dimensions.height
    if (width <= 0 || height <= 0) return
    // Fit both axes, including negative origins and whitespace outside the model's visible bounds.
    fitScale = Math.min((Math.max(1, width - 24)) / Math.max(1, extent.width), (Math.max(1, height - 24)) / Math.max(1, extent.height), 1)
    overview = true
    view.scaleAndTranslate(fitScale, (width / fitScale - extent.width) / 2 - extent.x, (height / fitScale - extent.height) / 2 - extent.y)
    setInteraction(); publish()
  }
  function zoom(scale: number, point: Point = { x: width / 2, y: height / 2 }, anchor?: DrawioViewState) {
    if (!graph) return
    const old = anchor ?? snapshot()
    const next = Math.max(Math.min(fitScale, .01), Math.min(8, scale))
    const worldX = old.x + (point.x - width / 2) / old.scale
    const worldY = old.y + (point.y - height / 2) / old.scale
    overview = false
    graph.view.scaleAndTranslate(next, point.x / next - worldX, point.y / next - worldY)
    setInteraction(); publish()
  }
  function resized() {
    resizeQueued = false
    if (!graph) return
    const next = size()
    if (next.width === width && next.height === height) return
    const previous = snapshot()
    if (overview) fit()
    else { width = next.width; height = next.height; restore(previous) }
  }
  const observeSize = () => { if (!resizeQueued) { resizeQueued = true; requestAnimationFrame(resized) } }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(observeSize).observe(container)
  window.addEventListener('resize', observeSize)
  document.addEventListener('click', event => {
    if ((event.target as Element).closest?.('a')) { event.preventDefault(); event.stopPropagation() }
  }, true)
  container.addEventListener('dblclick', event => {
    event.preventDefault(); event.stopImmediatePropagation()
  }, true)
  container.addEventListener('keydown', event => {
    if (!graph || event.ctrlKey || event.metaKey || event.altKey) return
    if (!['+', '=', '-', '0', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault(); event.stopImmediatePropagation()
    if (event.key === '0') fit()
    else if (event.key === 'Escape') { if (overview) report('exit'); else fit() }
    else if (event.key === '+' || event.key === '=') zoom(graph.view.scale * 1.4)
    else if (event.key === '-') { if (graph.view.scale / 1.4 <= fitScale) fit(); else zoom(graph.view.scale / 1.4) }
    else if (!overview) { const view = snapshot(); restore({ ...view, x: view.x + (event.key === 'ArrowLeft' ? -40 : event.key === 'ArrowRight' ? 40 : 0) / view.scale,
      y: view.y + (event.key === 'ArrowUp' ? -40 : event.key === 'ArrowDown' ? 40 : 0) / view.scale }) }
  })
  const local = (event: { clientX: number; clientY: number }): Point => { const rect = container.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top } }
  function beginGesture() {
    const points = [...pointers.values()]
    if (!graph || !points.length) { gesture = undefined; return }
    gesture = { center: points.length > 1 ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 } : points[0],
      distance: points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0, view: snapshot() }
  }
  container.addEventListener('pointerdown', event => {
    if (!graph || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.stopImmediatePropagation()
    if (pointers.size === 0) { moved = false; hadPinch = false }
    pointers.set(event.pointerId, local(event)); hadPinch ||= pointers.size > 1; beginGesture()
    if (!overview) { event.preventDefault(); container.setPointerCapture(event.pointerId) }
  }, true)
  container.addEventListener('pointermove', event => {
    if (!graph || !pointers.has(event.pointerId) || !gesture) return
    event.stopImmediatePropagation()
    pointers.set(event.pointerId, local(event))
    const points = [...pointers.values()]
    const center = points.length > 1 ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 } : points[0]
    const dx = center.x - gesture.center.x, dy = center.y - gesture.center.y
    if (Math.hypot(dx, dy) > 6) moved = true
    // Overview leaves document scrolling/accessibility zoom with the browser; detail owns gestures.
    if (overview) return
    event.preventDefault()
    if (points.length > 1 && gesture.distance > 0) {
      hadPinch = true
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
      zoom(gesture.view.scale * distance / gesture.distance, gesture.center, gesture.view)
      const scale = graph.view.scale
      graph.view.scaleAndTranslate(scale, graph.view.translate.x + dx / scale, graph.view.translate.y + dy / scale)
      publish()
    } else restore({ ...gesture.view, x: gesture.view.x - dx / gesture.view.scale, y: gesture.view.y - dy / gesture.view.scale, overview: false })
  }, true)
  function endPointer(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return
    event.stopImmediatePropagation()
    const point = local(event), wasOverview = overview
    pointers.delete(event.pointerId)
    if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId)
    if (graph && event.type === 'pointerup' && !moved && !hadPinch && pointers.size === 0) {
      const time = Date.now()
      if (wasOverview) zoom(Math.max(fitScale * 2.5, .8), point)
      else if (lastTap && time - lastTap.time < 350 && Math.hypot(point.x - lastTap.point.x, point.y - lastTap.point.y) < 24) fit()
      lastTap = { time, point }
    }
    beginGesture()
  }
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) container.addEventListener(name, endPointer, true)
  container.addEventListener('wheel', event => {
    if (overview || !graph) return
    event.preventDefault(); event.stopImmediatePropagation()
    zoom(graph.view.scale * (event.deltaY < 0 ? 1.2 : 1 / 1.2), local(event))
  }, { capture: true, passive: false })
  window.addEventListener('message', event => {
    if (event.source !== parent || event.origin !== host || event.data?.token !== token) return
    try {
      const data = event.data
      if (data.action === 'load') {
        const active = ++generation
        graph?.destroy(); graph = undefined; pointers.clear(); gesture = undefined; lastTap = undefined
        container.replaceChildren()
        container.setAttribute('data-mxgraph', JSON.stringify({ xml: data.xml, toolbar: null, lightbox: false, nav: false,
          'auto-fit': false, 'auto-crop': false, responsive: false, resize: false, 'browser-translate': false, lazy: false }))
        runtime.GraphViewer!.createViewerForElement(container, instance => {
          if (active !== generation) { instance.graph.destroy(); return }
          graph = instance.graph; graph.setPanning(false)
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (active !== generation) return
            fit()
            if (data.view && data.view.overview === false) restore(data.view)
            report('rendered')
          }))
        })
      } else if (graph) {
        if (data.action === 'zoom-in') zoom(graph.view.scale * 1.4)
        if (data.action === 'detail') zoom(Math.max(graph.view.scale * 1.4, .8))
        if (data.action === 'zoom-out') { if (graph.view.scale / 1.4 <= fitScale) fit(); else zoom(graph.view.scale / 1.4) }
        if (data.action === 'fit') fit()
      }
    } catch { report('error') }
  })
  report('ready')
}
