import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, Loader2, RotateCcw, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type StateTone = 'loading' | 'error' | 'success' | 'warning' | 'info'

interface ActionConfig {
  label: string
  onClick: () => void
  variant?: 'default' | 'outline' | 'secondary'
}

interface StatePanelProps {
  tone: StateTone
  title: string
  description: string
  contextTag?: string
  action?: ActionConfig
  secondaryAction?: ActionConfig
  metaTrace?: string
  extra?: ReactNode
  className?: string
}

const TONE_CONFIG = {
  loading: {
    icon: Loader2,
    iconColor: 'text-slate-700',
    borderColor: 'border-slate-200/90',
    spin: true,
  },
  error: {
    icon: ShieldAlert,
    iconColor: 'text-rose-600',
    borderColor: 'border-rose-200/80',
    spin: false,
  },
  warning: {
    icon: AlertCircle,
    iconColor: 'text-amber-600',
    borderColor: 'border-amber-200/80',
    spin: false,
  },
  success: {
    icon: CheckCircle2,
    iconColor: 'text-emerald-600',
    borderColor: 'border-emerald-200/80',
    spin: false,
  },
  info: {
    icon: Info,
    iconColor: 'text-slate-700',
    borderColor: 'border-slate-200/90',
    spin: false,
  },
}

export function StatePanel({
  tone,
  title,
  description,
  contextTag,
  action,
  secondaryAction,
  metaTrace,
  extra,
  className,
}: StatePanelProps) {
  const config = TONE_CONFIG[tone]
  const Icon = config.icon

  return (
    <section
      className={cn(
        'rounded-xl border bg-white p-5 sm:p-6 shadow-xs text-left transition-all',
        config.borderColor,
        className,
      )}
    >
      {/* Context pill */}
      {contextTag && (
        <span className="mb-2 inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
          {contextTag}
        </span>
      )}

      {/* Title with inline subtle icon */}
      <div className="flex items-center gap-2">
        <Icon
          aria-hidden="true"
          className={cn('size-4.5 shrink-0', config.iconColor, config.spin && 'animate-spin')}
        />
        <h2 className="text-sm font-semibold tracking-tight text-slate-900 sm:text-base">{title}</h2>
      </div>

      {/* Explanation text */}
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600 sm:text-sm">{description}</p>

      {/* Extra content slot */}
      {extra && <div className="mt-4">{extra}</div>}

      {/* Metadata / Error trace line */}
      {metaTrace && (
        <div className="mt-3.5 border-t border-slate-100 pt-2.5 font-mono text-[11px] text-slate-400">
          {metaTrace}
        </div>
      )}

      {/* Recovery action buttons */}
      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          {action && (
            <Button
              variant={action.variant ?? 'default'}
              className={cn(
                'h-9 rounded-lg px-4 text-xs font-medium',
                (!action.variant || action.variant === 'default') && 'bg-slate-900 text-white hover:bg-slate-800',
              )}
              onClick={action.onClick}
            >
              {tone === 'loading' || tone === 'error' ? (
                <RotateCcw aria-hidden="true" className="mr-1.5 size-3.5" />
              ) : null}
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant={secondaryAction.variant ?? 'outline'}
              className="h-9 rounded-lg border-slate-200 px-4 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
