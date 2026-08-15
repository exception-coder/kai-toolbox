import type { MouseEvent } from 'react'
import { Clock, Loader2 } from 'lucide-react'
import type { DevDocEstimation, EstimationConfidence } from '../types'

export const ESTIMATION_CONFIDENCE_LABEL: Record<EstimationConfidence, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
}

export const ESTIMATION_CONFIDENCE_COLOR: Record<EstimationConfidence, string> = {
  LOW: 'bg-gray-500/15 text-gray-400 border-gray-500/20',
  MEDIUM: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  HIGH: 'bg-green-500/15 text-green-500 border-green-500/20',
}

interface EstimationBadgeProps {
  estimation: DevDocEstimation
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  compact?: boolean
}

/** 工时评估紧凑徽标，供历史列表和开发文档工具栏复用。 */
export function EstimationBadge({ estimation, onClick, compact }: EstimationBadgeProps) {
  const running = estimation.workStatus === 'RUNNING'
  const failed = estimation.workStatus === 'ERROR'
  const colorClass = running
    ? 'bg-violet-500/15 text-violet-400 border-violet-500/20'
    : estimation.stale
      ? 'bg-amber-500/15 text-amber-500 border-amber-500/20'
      : failed
        ? 'bg-red-500/15 text-red-400 border-red-500/20'
        : ESTIMATION_CONFIDENCE_COLOR[estimation.confidence]

  const title = running
    ? 'AI 工时正在后台评估'
    : failed
      ? estimation.workError || 'AI 工时评估失败'
      : estimation.stale
        ? '开发文档已更新，此评估可能已过期，建议重新评估'
        : `AI 工时评估 · 信心：${ESTIMATION_CONFIDENCE_LABEL[estimation.confidence]}`
  const sizeClass = compact ? 'text-[9px] px-1' : 'text-[10px] px-1.5 py-0.5'
  const interactionClass = onClick ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex flex-shrink-0 items-center gap-1 rounded border leading-tight',
        'whitespace-nowrap transition-colors',
        colorClass,
        sizeClass,
        interactionClass,
      ].join(' ')}
      title={title}
    >
      {running ? (
        <Loader2 className={`${compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} animate-spin`} />
      ) : (
        <Clock className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      )}
      {running ? '评估中' : failed ? '评估失败' : `${estimation.hoursMin}-${estimation.hoursMax}h`}
      {estimation.stale && <span>⚠</span>}
    </button>
  )
}
