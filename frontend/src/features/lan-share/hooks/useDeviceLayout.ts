import { useEffect, useMemo, useState } from 'react'

export type LayoutMode = 'circle' | 'grid' | 'vertical-list'

export interface ScenePosition {
  x: number          // 0..1 相对画布宽度
  y: number          // 0..1 相对画布高度
  scale: number      // 0..1 缩放系数（边缘略小）
  isSelf: boolean
}

export interface UseDeviceLayoutArgs {
  peerCount: number             // 含本机
  width: number
  height: number
}

export interface UseDeviceLayoutResult {
  mode: LayoutMode
  positions: ScenePosition[]    // 索引 0 是本机；其余按 peers 数组顺序
}

const VERTICAL_BREAKPOINT = 360

export function useDeviceLayout({ peerCount, width, height }: UseDeviceLayoutArgs): UseDeviceLayoutResult {
  return useMemo(() => {
    const total = Math.max(peerCount, 1)

    // 极窄屏：竖向列表
    if (width > 0 && width < VERTICAL_BREAKPOINT) {
      return verticalList(total)
    }

    // ≤6 用环形；≥7 切到 3 列网格
    if (total <= 6) return circle(total, width, height)
    return grid(total, width, height)
  }, [peerCount, width, height])
}

function verticalList(total: number): UseDeviceLayoutResult {
  const positions: ScenePosition[] = []
  for (let i = 0; i < total; i++) {
    positions.push({
      x: 0.5,
      y: (i + 0.5) / total,
      scale: 1,
      isSelf: i === 0,
    })
  }
  return { mode: 'vertical-list', positions }
}

function circle(total: number, _w: number, _h: number): UseDeviceLayoutResult {
  // 本机居中略偏下，其他在上方圆弧分布
  if (total === 1) {
    return { mode: 'circle', positions: [{ x: 0.5, y: 0.5, scale: 1.1, isSelf: true }] }
  }
  const positions: ScenePosition[] = [{ x: 0.5, y: 0.78, scale: 1.05, isSelf: true }]
  const peerCount = total - 1
  const radius = 0.34
  // 在上半圆均匀排布；从左到右
  for (let i = 0; i < peerCount; i++) {
    const t = peerCount === 1 ? 0.5 : i / (peerCount - 1)
    // 角度从 200° 到 -20°（即从左下到右上的上半弧）
    const angleDeg = 200 - t * 220
    const angle = (angleDeg * Math.PI) / 180
    positions.push({
      x: 0.5 + radius * Math.cos(angle),
      y: 0.5 + radius * Math.sin(angle) * 0.7, // 椭圆压扁，更贴合屏幕
      scale: 0.95,
      isSelf: false,
    })
  }
  return { mode: 'circle', positions }
}

function grid(total: number, _w: number, _h: number): UseDeviceLayoutResult {
  // 第 1 项 = 本机，置于网格最后一格的中心位置；peer 从左上往右下铺
  const cols = 3
  const rows = Math.ceil(total / cols)
  const positions: ScenePosition[] = new Array(total)
  // 先排 peers，索引 1..total-1
  for (let i = 1; i < total; i++) {
    const peerIdx = i - 1
    const r = Math.floor(peerIdx / cols)
    const c = peerIdx % cols
    positions[i] = {
      x: (c + 0.5) / cols,
      y: (r + 0.5) / rows * 0.78,    // 上 78% 区域留给 peers
      scale: 0.85,
      isSelf: false,
    }
  }
  // 本机置底中
  positions[0] = { x: 0.5, y: 0.9, scale: 1.05, isSelf: true }
  return { mode: 'grid', positions }
}

export function useViewportSize(elementRef: React.RefObject<HTMLElement | null>): { w: number; h: number } {
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

  useEffect(() => {
    const el = elementRef.current
    if (!el) return
    let timer: number | undefined
    const measure = () => {
      const rect = el.getBoundingClientRect()
      setSize({ w: rect.width, h: rect.height })
    }
    measure()
    const ro = new ResizeObserver(() => {
      if (timer !== undefined) window.clearTimeout(timer)
      timer = window.setTimeout(measure, 100)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [elementRef])

  return size
}
