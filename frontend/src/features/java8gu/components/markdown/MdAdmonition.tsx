import { AlertCircle, AlertTriangle, Info, Lightbulb, LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AdmonitionType = 'note' | 'tip' | 'warning' | 'danger' | 'info'

interface Config {
  icon: LucideIcon
  color: string
  bg: string
  border: string
  label: string
}

const CONFIGS: Record<AdmonitionType, Config> = {
  note: {
    icon: Info,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50/50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    label: '备注',
  },
  info: {
    icon: Info,
    color: 'text-sky-600 dark:text-sky-400',
    bg: 'bg-sky-50/50 dark:bg-sky-900/20',
    border: 'border-sky-200 dark:border-sky-800',
    label: '信息',
  },
  tip: {
    icon: Lightbulb,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50/50 dark:bg-emerald-900/20',
    border: 'border-emerald-200 dark:border-emerald-800',
    label: '提示',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50/50 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-800',
    label: '注意',
  },
  danger: {
    icon: AlertCircle,
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-50/50 dark:bg-rose-900/20',
    border: 'border-rose-200 dark:border-rose-800',
    label: '警告',
  },
}

interface Props {
  children: React.ReactNode
  type?: AdmonitionType
  title?: string
}

export function MdAdmonition({ children, type = 'note', title }: Props) {
  const config = CONFIGS[type] || CONFIGS.note
  const Icon = config.icon

  return (
    <div className={cn('my-6 rounded-lg border-l-4 p-4 shadow-sm', config.bg, config.border)}>
      <div className={cn('mb-2 flex items-center gap-2 font-semibold', config.color)}>
        <Icon className="h-4 w-4" />
        <span className="text-[13px] uppercase tracking-wider">{title || config.label}</span>
      </div>
      <div className="prose-sm text-[14px] leading-relaxed text-[var(--color-foreground)]/90">
        {children}
      </div>
    </div>
  )
}
