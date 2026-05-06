import { useEffect, useRef, useState } from 'react'
import type { DeviceKind } from '../../types'
import { DeviceKindIcon } from './DeviceKindIcon'
import { cn } from '@/lib/utils'

export type AvatarState = 'idle' | 'connecting' | 'connected' | 'transferring' | 'failed'

interface Props {
  kind: DeviceKind
  nickname: string
  isSelf: boolean
  state: AvatarState
  progress?: number          // 0..1，仅 state=transferring 时使用
  size?: number              // 拟物 SVG 像素尺寸
  selfTag?: string           // 本机右上角小标识，默认「本机」
  onClick?: () => void
  onLongPress?: () => void
  shaking?: boolean          // 失败抖动一次
}

const LONG_PRESS_MS = 500

export function DeviceAvatar({
  kind, nickname, isSelf, state, progress,
  size = 64, selfTag = '本机',
  onClick, onLongPress, shaking,
}: Props) {
  const [pressing, setPressing] = useState(false)
  const longPressFiredRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

  const startPress = () => {
    longPressFiredRef.current = false
    setPressing(true)
    if (onLongPress) {
      timerRef.current = window.setTimeout(() => {
        longPressFiredRef.current = true
        onLongPress()
      }, LONG_PRESS_MS)
    }
  }
  const endPress = () => {
    setPressing(false)
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }
  const handleClick = () => {
    if (longPressFiredRef.current) return
    onClick?.()
  }

  const glowClass = `lanshare-glow lanshare-glow-${state}`

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
      onContextMenu={e => e.preventDefault()}
      className={cn(
        'group relative inline-flex flex-col items-center gap-1 select-none',
        'p-2 rounded-2xl bg-transparent',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
        'transition-all',
        pressing && 'scale-95',
      )}
      style={{ WebkitTouchCallout: 'none', WebkitTapHighlightColor: 'transparent', minWidth: 64, minHeight: 64 }}
      aria-label={`${nickname}${isSelf ? ' (本机)' : ''}`}
    >
      <div className={cn('relative', shaking && 'lanshare-shake')}>
        <div className={glowClass} />
        <div className="lanshare-avatar-body">
          <DeviceKindIcon kind={kind} size={size} />
          {state === 'transferring' && progress !== undefined && (
            <ProgressRing progress={progress} size={size} />
          )}
        </div>
        {isSelf && (
          <span className="absolute -top-1 -right-1 rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-[10px] leading-none px-1.5 py-0.5 shadow">
            {selfTag}
          </span>
        )}
      </div>
      <span className="max-w-[6rem] truncate text-xs text-[var(--color-foreground)] opacity-90">{nickname}</span>
    </button>
  )
}

function ProgressRing({ progress, size }: { progress: number; size: number }) {
  const stroke = 3
  const r = size / 2 - stroke
  const c = 2 * Math.PI * r
  const offset = c * (1 - Math.max(0, Math.min(1, progress)))
  return (
    <svg
      className="lanshare-progress-ring absolute inset-0 pointer-events-none"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#2eb45f"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
      />
    </svg>
  )
}
