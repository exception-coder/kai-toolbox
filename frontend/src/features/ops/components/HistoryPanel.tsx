import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ChevronRight, Clock, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getHistoryDetail, listHistory } from '../api'
import type { DatasourceView, HistoryDetailView } from '../types'
import { RedisValue, ResultTable } from './ResultViews'

interface Props {
  datasource: DatasourceView
}

/** 查询历史：左列表 + 点开看当次执行结果（若已存快照）。 */
export function HistoryPanel({ datasource }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const historyQuery = useQuery({
    queryKey: ['ops', 'history', datasource.id],
    queryFn: () => listHistory(datasource.id, 100),
  })
  const list = historyQuery.data ?? []

  const detailQuery = useQuery({
    queryKey: ['ops', 'history-detail', datasource.id, selectedId],
    queryFn: () => getHistoryDetail(datasource.id, selectedId!),
    enabled: !!selectedId,
  })

  if (historyQuery.isLoading) {
    return <div className="p-4 text-sm text-[var(--color-muted-foreground)]">加载历史中…</div>
  }
  if (list.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-[var(--color-muted-foreground)]">
        <Clock className="mx-auto mb-1 size-5 opacity-50" />
        暂无执行记录
      </div>
    )
  }

  return (
    <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[280px_1fr]">
      <div className="min-h-0 space-y-1 overflow-auto">
        {list.map(h => (
          <button
            key={h.id}
            onClick={() => setSelectedId(h.id)}
            className={cn(
              'flex w-full flex-col gap-1 rounded-md border px-2 py-1.5 text-left text-xs',
              selectedId === h.id
                ? 'border-[var(--color-ring)] bg-[var(--color-muted)]/40'
                : 'hover:bg-[var(--color-muted)]/30',
            )}
          >
            <div className="flex items-center gap-1.5">
              {h.status === 'OK'
                ? <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                : <XCircle className="size-3.5 shrink-0 text-[var(--color-destructive)]" />}
              <span className="min-w-0 flex-1 truncate font-mono">{h.content}</span>
              {h.hasResult && <ChevronRight className="size-3 shrink-0 text-[var(--color-muted-foreground)]" />}
            </div>
            <div className="flex items-center gap-2 text-[var(--color-muted-foreground)]">
              <span>{new Date(h.executedAt).toLocaleString()}</span>
              {h.elapsedMs != null && <span>· {h.elapsedMs}ms</span>}
              {h.rowCount != null && <span>· {h.rowCount} 行</span>}
            </div>
          </button>
        ))}
      </div>

      <div className="min-h-0 overflow-auto rounded-md border p-3">
        {!selectedId ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-[var(--color-muted-foreground)]">
            点左侧一条记录查看详情
          </div>
        ) : detailQuery.isLoading ? (
          <div className="text-sm text-[var(--color-muted-foreground)]">加载中…</div>
        ) : detailQuery.data ? (
          <HistoryDetail detail={detailQuery.data} />
        ) : null}
      </div>
    </div>
  )
}

function HistoryDetail({ detail }: { detail: HistoryDetailView }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="rounded-md bg-[var(--color-muted)]/30 p-2 font-mono text-xs whitespace-pre-wrap">
        {detail.content}
      </div>
      <div className="text-xs text-[var(--color-muted-foreground)]">
        {new Date(detail.executedAt).toLocaleString()}
        {detail.elapsedMs != null && ` · ${detail.elapsedMs}ms`}
        {detail.rowCount != null && ` · ${detail.rowCount} 行`}
      </div>
      {detail.status === 'ERROR' && detail.errorMsg && (
        <div className="rounded-md border border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/10 px-3 py-2 text-xs text-[var(--color-destructive)] whitespace-pre-wrap">
          {detail.errorMsg}
        </div>
      )}
      {detail.result != null && detail.kind === 'SQL' && isSqlResult(detail.result) && (
        <ResultTable columns={detail.result.columns} rows={detail.result.rows} />
      )}
      {detail.result != null && detail.kind === 'REDIS' && isRedisResult(detail.result) && (
        <div className="rounded-md border bg-[var(--color-muted)]/20 p-3">
          <RedisValue value={detail.result.result} />
        </div>
      )}
      {detail.result == null && detail.status === 'OK' && (
        <div className="text-xs text-[var(--color-muted-foreground)]">
          该记录未存结果快照（无结果集，或体量超出保存上限）。
        </div>
      )}
    </div>
  )
}

function isSqlResult(v: unknown): v is { columns: string[]; rows: (string | null)[][] } {
  return typeof v === 'object' && v !== null && 'columns' in v && 'rows' in v
}

function isRedisResult(v: unknown): v is { command: string; result: unknown } {
  return typeof v === 'object' && v !== null && 'command' in v && 'result' in v
}
