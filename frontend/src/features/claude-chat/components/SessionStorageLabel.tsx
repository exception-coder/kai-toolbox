import type { SessionStorageView } from '../types'
import { storageDescription, storageLabel } from '../lib/sessionStorage'
import { cn } from '@/lib/utils'

/** 复用会话元信息行展示大小；保持非交互语义，避免在行按钮内嵌套按钮。 */
export function SessionStorageLabel({ value, failed = false, className }: {
  value?: SessionStorageView
  failed?: boolean
  className?: string
}) {
  const label = storageLabel(value, failed)
  return <span className={cn('shrink-0 tabular-nums text-[var(--color-muted-foreground)]', className)}
    title={storageDescription(value, failed)} aria-label={label}>{label}{value && failed && ' · 旧数据'}</span>
}
