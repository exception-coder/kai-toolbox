import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, ImagePlus, RotateCcw, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { applyMosaic, normalizeRect, type MosaicMode, type Rect } from '../lib/mosaic'

const MODE_OPTIONS = [
  { value: 'pixelate', label: '像素化' },
  { value: 'blur', label: '高斯模糊' },
  { value: 'black', label: '黑条' },
] as const

const STRENGTH_DEFAULTS: Record<MosaicMode, number> = {
  pixelate: 12,
  blur: 8,
  black: 0,
}

const STRENGTH_RANGE: Record<MosaicMode, { min: number; max: number; step: number; suffix: string }> = {
  pixelate: { min: 4, max: 40, step: 1, suffix: 'px 块' },
  blur: { min: 2, max: 30, step: 1, suffix: 'px 半径' },
  black: { min: 0, max: 0, step: 1, suffix: '' },
}

const HISTORY_LIMIT = 20

interface DragState {
  startX: number
  startY: number
  curX: number
  curY: number
}

export function ImageMosaicCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [hasImage, setHasImage] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [mode, setMode] = useState<MosaicMode>('pixelate')
  const [strength, setStrength] = useState<number>(STRENGTH_DEFAULTS.pixelate)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [historyDepth, setHistoryDepth] = useState(0)
  const historyRef = useRef<ImageData[]>([])

  const pushHistory = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height)
    historyRef.current.push(snap)
    if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift()
    setHistoryDepth(historyRef.current.length)
  }, [])

  const resetHistory = useCallback(() => {
    historyRef.current = []
    setHistoryDepth(0)
  }, [])

  const handleFile = useCallback(
    (file: File | null) => {
      if (!file) return
      if (!file.type.startsWith('image/')) return
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        const canvas = canvasRef.current
        if (!canvas) {
          URL.revokeObjectURL(url)
          return
        }
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          URL.revokeObjectURL(url)
          return
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)
        URL.revokeObjectURL(url)
        resetHistory()
        setHasImage(true)
        setFileName(file.name)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
      }
      img.src = url
    },
    [resetHistory],
  )

  const onPickFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFile(e.target.files?.[0] ?? null)
      e.target.value = '' // 允许重复选同一张
    },
    [handleFile],
  )

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const file = e.dataTransfer.files?.[0] ?? null
      handleFile(file)
    },
    [handleFile],
  )

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }, [])

  // 把屏幕事件坐标转换成 canvas 内部像素坐标
  const toCanvasPoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const sx = canvas.width / rect.width
    const sy = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy,
    }
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!hasImage) return
      const p = toCanvasPoint(e)
      e.currentTarget.setPointerCapture(e.pointerId)
      setDrag({ startX: p.x, startY: p.y, curX: p.x, curY: p.y })
    },
    [hasImage, toCanvasPoint],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drag) return
      const p = toCanvasPoint(e)
      setDrag(prev => (prev ? { ...prev, curX: p.x, curY: p.y } : prev))
    },
    [drag, toCanvasPoint],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drag) return
      e.currentTarget.releasePointerCapture(e.pointerId)
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        const raw: Rect = {
          x: drag.startX,
          y: drag.startY,
          w: drag.curX - drag.startX,
          h: drag.curY - drag.startY,
        }
        const region = normalizeRect(raw, canvas.width, canvas.height)
        if (region) {
          pushHistory()
          applyMosaic(ctx, region, mode, strength)
        }
      }
      setDrag(null)
    },
    [drag, mode, strength, pushHistory],
  )

  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    setDrag(null)
  }, [])

  const undo = useCallback(() => {
    const snap = historyRef.current.pop()
    if (!snap) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) {
      // 历史快照尺寸应与当前 canvas 一致；万一不一致，先 resize
      if (snap.width !== canvas.width || snap.height !== canvas.height) {
        canvas.width = snap.width
        canvas.height = snap.height
      }
      ctx.putImageData(snap, 0, 0)
    }
    setHistoryDepth(historyRef.current.length)
  }, [])

  const reset = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    if (historyRef.current.length === 0) return
    const first = historyRef.current[0]
    canvas.width = first.width
    canvas.height = first.height
    ctx.putImageData(first, 0, 0)
    resetHistory()
  }, [resetHistory])

  const download = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const base = fileName ? fileName.replace(/\.[^.]+$/, '') : 'image'
      a.download = `${base}-mosaic.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 'image/png')
  }, [fileName])

  // 切换模式时重置强度到该模式默认值
  useEffect(() => {
    setStrength(STRENGTH_DEFAULTS[mode])
  }, [mode])

  const range = STRENGTH_RANGE[mode]
  const showStrength = mode !== 'black'

  // 计算用于在屏幕上显示的拖拽矩形（CSS 像素，相对于 canvas）
  const overlayStyle = (() => {
    if (!drag) return null
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const sx = rect.width / canvas.width
    const sy = rect.height / canvas.height
    const x = Math.min(drag.startX, drag.curX) * sx
    const y = Math.min(drag.startY, drag.curY) * sy
    const w = Math.abs(drag.curX - drag.startX) * sx
    const h = Math.abs(drag.curY - drag.startY) * sy
    return { left: x, top: y, width: w, height: h }
  })()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex">
          <input type="file" accept="image/*" className="hidden" onChange={onPickFile} />
          <Button asChild variant="default" size="sm">
            <span className="cursor-pointer">
              <ImagePlus className="mr-1" />
              选择图片
            </span>
          </Button>
        </label>

        <div className="ml-2">
          <Segmented value={mode} onChange={setMode} options={MODE_OPTIONS} size="sm" />
        </div>

        {showStrength && (
          <label className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
            <span>强度</span>
            <input
              type="range"
              min={range.min}
              max={range.max}
              step={range.step}
              value={strength}
              onChange={e => setStrength(Number(e.target.value))}
              className="h-1.5 w-40 cursor-pointer accent-[var(--color-primary)]"
            />
            <span className="tabular-nums text-[var(--color-foreground)]">
              {strength} {range.suffix}
            </span>
          </label>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={undo}
            disabled={!hasImage || historyDepth === 0}
          >
            <Undo2 />
            撤销 {historyDepth > 0 && <span className="text-[var(--color-muted-foreground)]">({historyDepth})</span>}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={reset}
            disabled={!hasImage || historyDepth === 0}
          >
            <RotateCcw />
            还原
          </Button>
          <Button variant="default" size="sm" onClick={download} disabled={!hasImage}>
            <Download />
            下载 PNG
          </Button>
        </div>
      </div>

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        className="relative flex min-h-[420px] items-center justify-center overflow-auto rounded-md border bg-[var(--color-muted)]/40 p-4"
        style={{
          backgroundImage:
            'linear-gradient(45deg, rgba(0,0,0,0.06) 25%, transparent 25%), linear-gradient(-45deg, rgba(0,0,0,0.06) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(0,0,0,0.06) 75%), linear-gradient(-45deg, transparent 75%, rgba(0,0,0,0.06) 75%)',
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
        }}
      >
        {!hasImage && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-sm text-[var(--color-muted-foreground)]">
            <ImagePlus className="mb-2 h-6 w-6" />
            点击「选择图片」或将图片拖拽到此处开始
          </div>
        )}

        <div className="relative inline-block max-w-full">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            className="block max-w-full select-none"
            style={{
              height: 'auto',
              cursor: hasImage ? 'crosshair' : 'default',
              touchAction: 'none',
              display: hasImage ? 'block' : 'none',
            }}
          />
          {overlayStyle && (
            <div
              className="pointer-events-none absolute border-2 border-dashed border-[var(--color-primary)] bg-[var(--color-primary)]/10"
              style={overlayStyle}
            />
          )}
        </div>
      </div>

      <p className="text-xs text-[var(--color-muted-foreground)]">
        在画布上按住鼠标左键拖出矩形即可对该区域执行所选打码方式；多次框选可叠加。所有处理完全在浏览器内完成，图片不会上传服务器。
      </p>
    </div>
  )
}
