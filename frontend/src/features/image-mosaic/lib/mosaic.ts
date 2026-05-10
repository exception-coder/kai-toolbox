export type MosaicMode = 'pixelate' | 'blur' | 'black'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** 把矩形 clamp 到 canvas 范围内并取整。无效区域返回 null。 */
export function normalizeRect(r: Rect, maxW: number, maxH: number): Rect | null {
  let x = Math.round(r.x)
  let y = Math.round(r.y)
  let w = Math.round(r.w)
  let h = Math.round(r.h)
  if (w < 0) {
    x += w
    w = -w
  }
  if (h < 0) {
    y += h
    h = -h
  }
  if (x < 0) {
    w += x
    x = 0
  }
  if (y < 0) {
    h += y
    y = 0
  }
  if (x + w > maxW) w = maxW - x
  if (y + h > maxH) h = maxH - y
  if (w < 2 || h < 2) return null
  return { x, y, w, h }
}

/** 像素化：把矩形区域按 block 大小取色块平均。block 越大越糊。 */
export function applyPixelate(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  block: number,
): void {
  const { x, y, w, h } = rect
  const size = Math.max(2, Math.floor(block))
  const img = ctx.getImageData(x, y, w, h)
  const data = img.data
  for (let by = 0; by < h; by += size) {
    for (let bx = 0; bx < w; bx += size) {
      const bw = Math.min(size, w - bx)
      const bh = Math.min(size, h - by)
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let n = 0
      for (let yy = 0; yy < bh; yy++) {
        for (let xx = 0; xx < bw; xx++) {
          const i = ((by + yy) * w + (bx + xx)) * 4
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          a += data[i + 3]
          n++
        }
      }
      r = r / n
      g = g / n
      b = b / n
      a = a / n
      for (let yy = 0; yy < bh; yy++) {
        for (let xx = 0; xx < bw; xx++) {
          const i = ((by + yy) * w + (bx + xx)) * 4
          data[i] = r
          data[i + 1] = g
          data[i + 2] = b
          data[i + 3] = a
        }
      }
    }
  }
  ctx.putImageData(img, x, y)
}

/** 高斯模糊：用 ctx.filter 借助离屏 canvas 模糊指定区域后回写。 */
export function applyBlur(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  radius: number,
): void {
  const { x, y, w, h } = rect
  const r = Math.max(1, Math.floor(radius))
  const tmp = document.createElement('canvas')
  tmp.width = w
  tmp.height = h
  const tctx = tmp.getContext('2d')
  if (!tctx) return
  tctx.filter = `blur(${r}px)`
  tctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, w, h)
  ctx.clearRect(x, y, w, h)
  ctx.drawImage(tmp, 0, 0, w, h, x, y, w, h)
}

/** 黑条遮挡：直接填充纯色。 */
export function applyBlackBar(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  color = '#000',
): void {
  ctx.save()
  ctx.fillStyle = color
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
  ctx.restore()
}

export function applyMosaic(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  mode: MosaicMode,
  strength: number,
): void {
  if (mode === 'pixelate') applyPixelate(ctx, rect, strength)
  else if (mode === 'blur') applyBlur(ctx, rect, strength)
  else applyBlackBar(ctx, rect)
}
