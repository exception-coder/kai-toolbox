import { useEffect, useRef } from 'react'
import type { Bands } from '../../hooks/useAudioAnalyser'

interface Props {
  /** 逐帧读取的驱动值：level=总振幅(0~1)，bands=低/中/高频(0~1) */
  drive: () => { level: number; bands: Bands }
}

/** 云团的 lobe（朵）相对布局：[dx, dy, r] 以 base 为单位，组成一朵蓬松积云。 */
const LOBES: [number, number, number][] = [
  [-1.25, 0.28, 0.72],
  [-0.62, -0.05, 1.02],
  [0.05, -0.32, 0.98],
  [0.7, -0.08, 0.92],
  [1.32, 0.26, 0.66],
  [0.42, 0.34, 0.9],
  [-0.32, 0.36, 0.86],
]

/**
 * 电子云团·蓝天白云：自绘浅蓝天空 + 一朵蓬松白云，随 drive() 实时呼吸/翻涌、缓慢飘移。
 * 白云用不透明 source-over（非 lighter，避免在浅底糊成全白）。
 * 纯渲染、无业务逻辑。DPR 适配，document.hidden 暂停 RAF 省电。
 */
export function CloudCanvas({ drive }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let w = 0
    let h = 0
    let dpr = 1

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    let smooth = 0
    const t0 = performance.now()

    const drawCloud = (cx: number, cy: number, base: number, t: number, bands: Bands) => {
      const lobe = (ox: number, oy: number, r: number, color: string, edge: string) => {
        const g = ctx.createRadialGradient(ox, oy, r * 0.1, ox, oy, r)
        g.addColorStop(0, color)
        g.addColorStop(0.62, color)
        g.addColorStop(1, edge)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(ox, oy, r, 0, Math.PI * 2)
        ctx.fill()
      }
      // 阴影层（底部偏移、淡蓝灰，给云体积感）
      for (let i = 0; i < LOBES.length; i++) {
        const [dx, dy, lr] = LOBES[i]
        const wob = 1 + Math.sin(t * 1.3 + i) * (0.05 + bands[1] * 0.12)
        const r = base * lr * wob
        lobe(cx + dx * base, cy + dy * base + r * 0.22, r, 'rgba(150,178,210,0.5)', 'rgba(150,178,210,0)')
      }
      // 白云主体（不透明白，边缘柔化）
      for (let i = 0; i < LOBES.length; i++) {
        const [dx, dy, lr] = LOBES[i]
        const wob = 1 + Math.sin(t * 1.5 + i * 1.7) * (0.06 + bands[0] * 0.14) + Math.sin(t * 2.4 + i) * bands[2] * 0.06
        const r = base * lr * wob
        lobe(cx + dx * base, cy + dy * base, r, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)')
      }
    }

    const frame = () => {
      const { level, bands } = drive()
      smooth += (level - smooth) * 0.18
      const t = (performance.now() - t0) / 1000

      // 蓝天背景
      const sky = ctx.createLinearGradient(0, 0, 0, h)
      sky.addColorStop(0, '#3f93e3')
      sky.addColorStop(0.55, '#8ec7f5')
      sky.addColorStop(1, '#dcefff')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, h)

      const cx = w / 2 + Math.sin(t * 0.3) * w * 0.05 // 缓慢左右飘
      const cy = h * 0.4 + Math.sin(t * 0.6) * h * 0.015
      const base = Math.min(w, h) * 0.14 * (1 + smooth * 0.5 + Math.sin(t * 1.2) * 0.04)

      drawCloud(cx, cy, base, t, bands)

      raf = requestAnimationFrame(frame)
    }

    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf)
        raf = 0
      } else if (!raf) {
        raf = requestAnimationFrame(frame)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [drive])

  return <canvas ref={canvasRef} className="absolute inset-0 size-full" />
}
