import { useMemo } from 'react'
import { ChevronDown, Database, Settings2 } from 'lucide-react'
import type { SessionPendingSql, SessionPendingSqlTarget } from '../types'
import { parsePendingSqlReview, type PendingSqlStatementKind } from '../lib/pendingSqlReview'

interface Props {
  registration: SessionPendingSql
  onManage: () => void
}

const KIND_LABELS: Record<PendingSqlStatementKind, string> = {
  DDL: 'DDL', DML: 'DML', ROLLBACK: '回滚', OTHER: 'SQL',
}

/** 当前会话的 SQL 登记清单；详细证据与编辑能力进入管理面板。 */
export function SessionDatabaseWorkspace({ registration, onManage }: Props) {
  const targets = useMemo<SessionPendingSqlTarget[]>(() => {
    const persistedTargets = registration.targets ?? []
    return persistedTargets.length > 0 ? persistedTargets : [{
      targetId: `${registration.sessionId}-legacy`, targetKey: 'legacy', datasourceId: null,
      targetEnvironment: registration.targetEnvironment || '未指定目标库', changeType: registration.changeType,
      sqlText: registration.sqlText, status: registration.status, sortOrder: 0,
      createdAt: registration.createdAt, updatedAt: registration.updatedAt, executedAt: registration.executedAt,
    }]
  }, [registration])
  const entries = useMemo(() => targets.flatMap(target => parsePendingSqlReview(target.sqlText).map(statement => ({ target, statement }))), [targets])

  return (
    <section className="cc-skin-view min-h-0 flex-1 overflow-y-auto bg-[var(--color-background)]">
      <header className="border-b border-[var(--color-border)] px-4 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <Database className="mt-0.5 size-4 shrink-0 text-[var(--color-primary)]" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold" title={registration.title ?? undefined}>{registration.title || '待执行 SQL'}</h2>
            <p className="mt-1 text-[11px] tabular-nums text-[var(--color-muted-foreground)]">登记于 {formatTime(registration.createdAt)}</p>
          </div>
          <button type="button" onClick={onManage} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2.5 text-xs hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
            <Settings2 className="size-3.5" />管理
          </button>
        </div>
        <div className="mt-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">执行库</p>
          <div className="scrollbar-autohide mt-2 flex gap-2 overflow-x-auto">
            {targets.map(target => <span key={target.targetKey} className="max-w-80 shrink-0 truncate border-l-2 border-[var(--color-primary)] pl-2 text-xs" title={target.targetEnvironment}>{target.targetEnvironment}</span>)}
          </div>
        </div>
      </header>

      <div className="px-4 py-4 sm:px-6">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 className="text-xs font-semibold">已登记 SQL</h3>
          <span className="text-[11px] tabular-nums text-[var(--color-muted-foreground)]">{entries.length} 条</span>
        </div>
        {entries.length > 0 ? (
          <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
            {entries.map(({ target, statement }) => (
              <details key={`${target.targetKey}-${statement.id}`} className="group">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 py-2.5">
                  <span className="w-8 shrink-0 text-[10px] font-semibold text-[var(--color-muted-foreground)]">{KIND_LABELS[statement.kind]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium" title={statement.title}>{statement.title}</span>
                    {targets.length > 1 && <span className="mt-0.5 block truncate text-[10px] text-[var(--color-muted-foreground)]">{target.targetEnvironment}</span>}
                  </span>
                  <ChevronDown className="size-3.5 shrink-0 text-[var(--color-muted-foreground)] transition-transform group-open:rotate-180" />
                </summary>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-[var(--color-border)] bg-slate-950 px-3 py-3 font-mono text-[11px] leading-5 text-slate-200">{statement.displaySql}</pre>
              </details>
            ))}
          </div>
        ) : <p className="border-y border-[var(--color-border)] py-8 text-center text-xs text-[var(--color-muted-foreground)]">当前登记没有 SQL 内容。</p>}
      </div>
    </section>
  )
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(value)
}
