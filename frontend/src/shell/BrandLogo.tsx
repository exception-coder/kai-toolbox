import { useId } from 'react'

/**
 * Forge 品牌标识：抽象几何 —— 六边形（Workspace / 锻造之炉）内含一枚火花（AI / 创造）。
 * 蓝→紫渐变（#2563EB → #7C3AED）。刻意抽象、不含工具箱/代码/终端语义，随产品扩展不受限。
 * 用 useId 生成唯一渐变 id，避免同页多实例的 id 冲突。尺寸由 className（h-x w-x）控制。
 */
export function BrandLogo({ className }: { className?: string }) {
  const gid = `forge-grad-${useId()}`
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="3.34" y1="2" x2="20.66" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563EB" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      {/* 六边形：Workspace / 炉 */}
      <path d="M12 2 20.66 7 20.66 17 12 22 3.34 17 3.34 7Z" fill={`url(#${gid})`} />
      {/* 四角火花：AI / 创造 */}
      <path d="M12 6.2 13.4 10.6 17.8 12 13.4 13.4 12 17.8 10.6 13.4 6.2 12 10.6 10.6Z" fill="#fff" />
    </svg>
  )
}
