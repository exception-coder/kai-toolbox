import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Database, Loader2, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SessionPendingSql, SessionPendingSqlTarget } from '../types'

const PendingSqlReviewWorkspace = lazy(() => import('./PendingSqlReviewWorkspace').then(module => ({
  default: module.PendingSqlReviewWorkspace,
})))

interface Props {
  registration: SessionPendingSql
  onManage: () => void
}

const STATUS_LABELS: Record<SessionPendingSql['status'], string> = {
  PENDING: '待执行',
  EXECUTED: '已执行',
  CANCELLED: '已取消',
}

/** 已登记 SQL 的常驻只读工作区；修改内容与状态仍进入原登记面板。 */
export function SessionDatabaseWorkspace({ registration, onManage }: Props) {
  const targets = useMemo<SessionPendingSqlTarget[]>(() => {
    const persistedTargets = registration.targets ?? []
    return persistedTargets.length > 0 ? persistedTargets : [{
      targetId: `${registration.sessionId}-legacy`,
      targetKey: 'legacy',
      datasourceId: null,
      targetEnvironment: registration.targetEnvironment || '未指定目标库',
      changeType: registration.changeType,
      sqlText: registration.sqlText,
      status: registration.status,
      sortOrder: 0,
      createdAt: registration.createdAt,
      updatedAt: registration.updatedAt,
      executedAt: registration.executedAt,
    }]
  }, [registration])
  const [activeKey, setActiveKey] = useState(targets[0]?.targetKey ?? '')
  const active = targets.find(target => target.targetKey === activeKey) ?? targets[0]

  useEffect(() => setActiveKey(targets[0]?.targetKey ?? ''), [registration.sessionId, registration.updatedAt])

  return (
    <section className="cc-skin-view flex min-h-0 flex-1 flex-col bg-[var(--color-background)]">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Database className="size-4 shrink-0 text-[var(--color-primary)]" />
            <h2 className="truncate text-sm font-semibold" title={registration.title ?? undefined}>{registration.title || '待执行 SQL'}</h2>
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-medium',
              registration.status === 'PENDING'
                ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
                : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
            )}>
              {STATUS_LABELS[registration.status]}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
            {targets.length} 个目标库 · 最后更新 {formatTime(registration.updatedAt)}
          </p>
        </div>
        <button type="button" onClick={onManage} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2.5 text-xs hover:bg-[var(--color-accent)]">
          <Settings2 className="size-3.5" />管理登记
        </button>
      </header>

      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-amber-500/5 px-4 py-2 text-[11px] text-amber-800 dark:text-amber-300">
        <AlertTriangle className="size-3.5 shrink-0" />
        <span>这里只用于审阅和复制，不会连接或执行数据库。</span>
        <span className="ml-auto hidden text-[var(--color-muted-foreground)] sm:inline">DDL：{ddlLabel(registration.ddlEvidenceStatus)}</span>
      </div>

      <div className="scrollbar-autohide flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--color-border)] px-4 py-2">
        {targets.map(target => (
          <button
            key={target.targetKey}
            type="button"
            onClick={() => setActiveKey(target.targetKey)}
            className={cn(
              'max-w-72 shrink-0 truncate rounded-md px-3 py-1.5 text-xs transition-colors',
              active?.targetKey === target.targetKey
                ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]',
            )}
            title={target.targetEnvironment}
          >
            {target.targetEnvironment}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 p-3 sm:p-4">
        {active ? (
          <Suspense fallback={<div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--color-muted-foreground)]"><Loader2 className="size-4 animate-spin" />加载 SQL 审阅器…</div>}>
            <PendingSqlReviewWorkspace
              key={`${registration.sessionId}-${active.targetKey}-${active.updatedAt}`}
              sqlText={active.sqlText}
              onSqlTextChange={() => undefined}
              onError={() => undefined}
              expanded
              allowEditing={false}
            />
          </Suspense>
        ) : (
          <p className="text-sm text-[var(--color-muted-foreground)]">当前登记没有可展示的 SQL。</p>
        )}
      </div>
    </section>
  )
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(value)
}

function ddlLabel(status: SessionPendingSql['ddlEvidenceStatus']): string {
  if (status === 'VERIFIED') return '已核验'
  if (status === 'PARTIAL') return '部分命中'
  if (status === 'STALE') return '基线已过期'
  return '未核验'
}
