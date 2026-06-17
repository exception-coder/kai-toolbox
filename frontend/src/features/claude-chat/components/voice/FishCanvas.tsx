import { useEffect, useRef } from 'react'
import type { Bands } from '../../hooks/useAudioAnalyser'

interface Props {
  /** 逐帧读取的驱动值：level=总振幅(0~1)，bands=低/中/高频(0~1) */
  drive: () => { level: number; bands: Bands }
}

/** 把 CSS 变量 --color-primary 解析成 canvas 可用的 rgb 三元组（兜底青蓝）。 */
function readPrimaryRGB(): [number, number, number] {
  try {
    const probe = document.createElement('span')
    probe.style.color = 'var(--color-primary)'
    probe.style.display = 'none'
    document.body.appendChild(probe)
    const c = getComputedStyle(probe).color // rgb(r, g, b)
    document.body.removeChild(probe)
    const m = c.match(/(\d+(?:\.\d+)?)/g)
    if (m && m.length >= 3) return [Number(m[0]), Number(m[1]), Number(m[2])]
  } catch { /* ignore */ }
  return [56, 189, 248]
}

/**
 * 流体光鱼·呼吸球：径向辉光 + 多谐波形变的 blob，随 drive() 实时呼吸/游动。
 * 纯渲染、无业务逻辑。DPR 适配，document.hidden 暂停 RAF 省电。
 */
export function FishCanvas({ drive }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const [pr, pg, pb] = readPrimaryRGB()
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

    const frame = () => {
      const { level, bands } = drive()
      smooth += (level - smooth) * 0.18 // 二次平滑，避免抖动
      const t = (performance.now() - t0) / 1000

      const cx = w / 2
      // 缓慢上下游动
      const cy = h / 2 + Math.sin(t * 0.6) * h * 0.02
      const base = Math.min(w, h) * 0.16
      const r = base * (1 + smooth * 0.55 + Math.sin(t * 1.4) * 0.04) // 呼吸 + 振幅

      ctx.clearRect(0, 0, w, h)

      // 外层辉光（多层径向渐变叠加）
      const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * (2.6 + smooth))
      glow.addColorStop(0, `rgba(${pr},${pg},${pb},${0.42 + smooth * 0.3})`)
      glow.addColorStop(0.4, `rgba(${pr},${pg},${pb},0.14)`)
      glow.addColorStop(1, `rgba(${pr},${pg},${pb},0)`)
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, w, h)

      // 形变 blob：多谐波，幅度受频段调制
      const pts = 72
      ctx.beginPath()
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2
        const wob =
          Math.sin(a * 3 + t * 1.6) * (0.05 + bands[0] * 0.12) +
          Math.sin(a * 5 - t * 1.1) * (0.035 + bands[1] * 0.1) +
          Math.sin(a * 8 + t * 2.2) * (0.02 + bands[2] * 0.08)
        const rr = r * (1 + wob)
        const x = cx + Math.cos(a) * rr
        const y = cy + Math.sin(a) * rr
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      const body = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r * 1.2)
      body.addColorStop(0, `rgba(255,255,255,${0.85})`)
      body.addColorStop(0.25, `rgba(${pr},${pg},${pb},0.95)`)
      body.addColorStop(1, `rgba(${pr},${pg},${pb},0.5)`)
      ctx.fillStyle = body
      ctx.shadowColor = `rgba(${pr},${pg},${pb},0.8)`
      ctx.shadowBlur = 24 + smooth * 40
      ctx.fill()
      ctx.shadowBlur = 0

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
