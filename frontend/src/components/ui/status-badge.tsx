import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * 全站状态徽章：业务只传语义 tone，颜色全部走 index.css 的状态令牌，
 * 自动适配明暗/护眼主题。约定：
 * - info    进行中 / 连接中（蓝，配 pulse 表示活跃）
 * - success 已完成 / 成功（绿）
 * - warning 等待 / 需注意（琥珀）
 * - danger  失败 / 错误（红）
 * - neutral 已取消 / 空闲（灰）
 */
export type StatusTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral'

const TONE_SOFT: Record<StatusTone, string> = {
  info: 'bg-[var(--color-info-soft)] text-[var(--color-info-soft-foreground)]',
  success: 'bg-[var(--color-success-soft)] text-[var(--color-success-soft-foreground)]',
  warning: 'bg-[var(--color-warning-soft)] text-[var(--color-warning-soft-foreground)]',
  danger: 'bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-foreground)]',
  neutral: 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
}

const TONE_DOT: Record<StatusTone, string> = {
  info: 'bg-[var(--color-info)]',
  success: 'bg-[var(--color-success)]',
  warning: 'bg-[var(--color-warning)]',
  danger: 'bg-[var(--color-danger)]',
  neutral: 'bg-[var(--color-muted-foreground)]',
}

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone: StatusTone
  /** 是否显示前导状态点，默认显示 */
  dot?: boolean
  /** 状态点呼吸闪烁，用于「进行中」这类活跃态 */
  pulse?: boolean
}

export function StatusBadge({
  tone,
  dot = true,
  pulse = false,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium',
        TONE_SOFT[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT[tone], pulse && 'animate-pulse')} />
      )}
      {children}
    </span>
  )
}
